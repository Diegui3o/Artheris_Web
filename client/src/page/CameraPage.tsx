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
        console.error("Error al reproducir video:", e);
      });
    }
  };

  useEffect(() => {
    // Conéctate al servidor de señalización usando la IP de la red local
    socketRef.current = io("http://192.168.1.11:3002/webrtc");
    const socket = socketRef.current;

    const createPeerConnection = () => {
      console.log("1. Creando PeerConnection...");
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log("-> LOCAL: Enviando candidato ICE:", event.candidate);
          socket.emit("candidate", { candidate: event.candidate, roomId });
        }
      };

      pc.ontrack = (event) => {
        console.log(
          "✅ Stream recibido con tracks:",
          event.streams[0].getTracks()
        );
        remoteStreamRef.current = event.streams[0];

        // Verifica los tracks
        const videoTracks = event.streams[0].getVideoTracks();
        const audioTracks = event.streams[0].getAudioTracks();
        console.log(
          `Video tracks: ${videoTracks.length}, Audio tracks: ${audioTracks.length}`
        );

        if (videoTracks.length > 0) {
          videoTracks[0].onended = () => console.log("Video track terminado");
          videoTracks[0].onmute = () => console.log("Video track muteado");
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ℹ️ Estado de conexión ICE: ${pc.iceConnectionState}`);
      };

      pc.onconnectionstatechange = () => {
        console.log(`ℹ️ Estado de conexión Peer: ${pc.connectionState}`);
      };

      peerConnectionRef.current = pc;
    };

    socket.on("connect", () => {
      console.log("✅ SUCCESS: Conectado al servidor de señalización!");
      console.log(`2. Uniéndose a la sala: ${roomId}`);
      socket.emit("join", roomId);
    });

    socket.on("offer", async (data: { sdp: string; type: RTCSdpType }) => {
      console.log("<- REMOTE: Oferta recibida del par remoto.");
      if (!peerConnectionRef.current) {
        createPeerConnection();
      }

      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log("-> LOCAL: Enviando respuesta al par remoto.");
        socket.emit("answer", { sdp: answer.sdp, type: answer.type, roomId });
      } catch (e) {
        console.error("Error al manejar la oferta:", e);
      }
    });

    socket.on("candidate", (data: { candidate: RTCIceCandidateInit }) => {
      if (data.candidate) {
        console.log("<- REMOTE: Candidato ICE recibido:", data.candidate);
        peerConnectionRef.current
          ?.addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch((e) => {
            console.error("Error al añadir candidato ICE:", e);
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
      <h1>Transmisión de Video</h1>
      <video
        ref={videoRef}
        playsInline
        controls
        style={{ width: "100%", maxWidth: "640px", cursor: "pointer" }}
        onClick={handleVideoClick}
      />
      <p>¡Haz clic en el video para reproducirlo!</p>
    </div>
  );
};

export default CameraPage;
