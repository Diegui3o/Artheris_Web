import React, { useEffect, useRef } from "react";
import io, { type Socket } from "socket.io-client";

const CameraPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const roomId = "test-room";
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const handleVideoClick = () => {
    if (videoRef.current && remoteStreamRef.current) {
      videoRef.current.srcObject = remoteStreamRef.current;
      videoRef.current.play().catch((e) => {
        console.error("Error when playing video:", e);
      });
    }
  };

  useEffect(() => {
    // Connect to the signaling server using the local network IP
    socketRef.current = io("http://192.168.1.11:3002/webrtc");
    const socket = socketRef.current;

    const createPeerConnection = () => {
      console.log("Creating PeerConnection...");
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log("-> LOCAL: Sending ICE candidate:", event.candidate);
          socket.emit("candidate", { candidate: event.candidate, roomId });
        }
      };

      pc.ontrack = (event) => {
        console.log(
          "✅ Stream received with tracks:",
          event.streams[0].getTracks()
        );
        remoteStreamRef.current = event.streams[0];

        // Verify the tracks
        const videoTracks = event.streams[0].getVideoTracks();
        const audioTracks = event.streams[0].getAudioTracks();
        console.log(
          `Video tracks: ${videoTracks.length}, Audio tracks: ${audioTracks.length}`
        );

        if (videoTracks.length > 0) {
          videoTracks[0].onended = () => console.log("Video track finished");
          videoTracks[0].onmute = () => console.log("Video track silenced");
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`ℹ️ Peer connection status: ${pc.connectionState}`);
      };

      peerConnectionRef.current = pc;
    };

    socket.on("connect", () => {
      console.log("✅ SUCCESS: Connected to the signaling server!");
      console.log(`Joining the room: ${roomId}`);
      socket.emit("join", roomId);
    });

    socket.on("offer", async (data: { sdp: string; type: RTCSdpType }) => {
      console.log("<- REMOTE: Offer received from the remote par.");
      if (!peerConnectionRef.current) {
        createPeerConnection();
      }

      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log("-> LOCAL: Sending response to the remote par.");
        socket.emit("answer", { sdp: answer.sdp, type: answer.type, roomId });
      } catch (e) {
        console.error("Error managing the offer:", e);
      }
    });

    socket.on("candidate", (data: { candidate: RTCIceCandidateInit }) => {
      if (data.candidate) {
        peerConnectionRef.current
          ?.addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch((e) => {
            console.error("Error adding ICE candidate:", e);
          });
      }
    });

    createPeerConnection();

    return () => {
      if (socket) {
        socket.disconnect();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  return (
    <div>
      <h1>Video transmission</h1>
      <video
        ref={videoRef}
        playsInline
        controls
        style={{ width: "100%", maxWidth: "640px", cursor: "pointer" }}
        onClick={handleVideoClick}
      />
      <p>¡Click on the video to play it!</p>
    </div>
  );
};

export default CameraPage;
