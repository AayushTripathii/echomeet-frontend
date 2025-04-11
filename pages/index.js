import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Video, ShieldCheck, MicOff, VideoOff, RefreshCw, Monitor, Flag, Ban } from "lucide-react";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

export default function EchoChat() {
  const [isVideoOn, setVideoOn] = useState(true);
  const [isMicOn, setMicOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [partnerFound, setPartnerFound] = useState(false);
  const [consent, setConsent] = useState({ age: false, terms: false });
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);

  const toggleMic = () => {
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getAudioTracks().forEach((track) => (track.enabled = !isMicOn));
      setMicOn((prev) => !prev);
    }
  };

  const toggleVideo = () => {
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getVideoTracks().forEach((track) => (track.enabled = !isVideoOn));
      setVideoOn((prev) => !prev);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      const stream = localVideoRef.current.srcObject;
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = (event) => recordedChunks.current.push(event.data);
      mediaRecorder.current.start();
      setIsRecording(true);
    } else {
      mediaRecorder.current.stop();
      setIsRecording(false);
      const blob = new Blob(recordedChunks.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "recorded-chat.webm";
      a.click();
      recordedChunks.current = [];
    }
  };

  const startVideoChat = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    peerConnection.current = new RTCPeerConnection();

    stream.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, stream);
    });

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          to: partnerId,
          data: { candidate: event.candidate }
        });
      }
    };
  };

  const handleReport = () => {
    if (reportReason && partnerId) {
      socket.emit("report-user", { partnerId, reason: reportReason });
      endChat();
    }
  };

  const handleBlock = () => {
    if (partnerId) {
      socket.emit("block-user", { partnerId });
      endChat();
    }
  };

  const endChat = () => {
    setPartnerFound(false);
    peerConnection.current?.close();
    peerConnection.current = null;
  };

  const [partnerId, setPartnerId] = useState(null);

  useEffect(() => {
    socket.on("partner-found", async ({ partnerId }) => {
      setPartnerFound(true);
      setPartnerId(partnerId);
      await startVideoChat();

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.emit("signal", {
        to: partnerId,
        data: { offer }
      });
    });

    socket.on("signal", async ({ from, data }) => {
      if (data.offer) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit("signal", { to: from, data: { answer } });
      } else if (data.answer) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      } else if (data.candidate) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Error adding received ice candidate", e);
        }
      }
    });

    socket.on("partner-left", () => {
      alert("Your partner has left the chat.");
      endChat();
    });

    return () => {
      socket.off("partner-found");
      socket.off("signal");
      socket.off("partner-left");
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-extrabold mb-4">Welcome to EchoMeet</h1>
      <p className="text-neutral-400 mb-6 max-w-xl text-center">
        A safe, anonymous space to meet new people and connect through video chat. Please confirm your age to begin.
      </p>

      {!partnerFound && (
        <div className="bg-neutral-800 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4 w-full max-w-md">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-green-500 scale-125" onChange={(e) => setConsent({ ...consent, age: e.target.checked })} />
            <span className="text-sm">I confirm that I am at least 18 years old</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-green-500 scale-125" onChange={(e) => setConsent({ ...consent, terms: e.target.checked })} />
            <span className="text-sm">I agree to the Terms & Conditions and Privacy Policy</span>
          </label>

          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold text-lg py-6 rounded-xl mt-4"
            disabled={!(consent.age && consent.terms)}
            onClick={() => socket.connect()}
          >
            Start Chatting
          </Button>
        </div>
      )}

      {partnerFound && (
        <>
          <div className="flex flex-col md:flex-row items-center gap-4 mt-4">
            <video ref={localVideoRef} autoPlay muted className="rounded-xl shadow-lg w-full md:w-96" />
            <video ref={remoteVideoRef} autoPlay className="rounded-xl shadow-lg w-full md:w-96" />
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            <Button onClick={toggleMic} variant="outline" className="rounded-xl">
              {isMicOn ? <MicOff /> : <ShieldCheck />}
            </Button>
            <Button onClick={toggleVideo} variant="outline" className="rounded-xl">
              {isVideoOn ? <VideoOff /> : <Video />}
            </Button>
            <Button onClick={toggleRecording} variant="outline" className="rounded-xl">
              <Monitor className={isRecording ? "text-red-500" : ""} />
            </Button>
            <Button onClick={() => setShowReportModal(true)} variant="outline" className="rounded-xl">
              <Flag />
            </Button>
            <Button onClick={handleBlock} variant="destructive" className="rounded-xl">
              <Ban />
            </Button>
          </div>
        </>
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-neutral-800 p-6 rounded-xl shadow-xl w-80 flex flex-col gap-4">
            <h2 className="text-lg font-bold">Report User</h2>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="bg-neutral-700 p-2 rounded"
            >
              <option value="">Select reason</option>
              <option value="Inappropriate content">Inappropriate content</option>
              <option value="Harassment">Harassment</option>
              <option value="Spam or scam">Spam or scam</option>
              <option value="Other">Other</option>
            </select>
            <div className="flex gap-2">
              <Button className="bg-red-600" onClick={handleReport}>Report</Button>
              <Button variant="outline" onClick={() => setShowReportModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
