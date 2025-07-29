import React, { useEffect, useRef, useState, useCallback } from "react";
import io, { type Socket } from "socket.io-client";

type AnalysisResults = {
  pasto?: number;
  tierra?: number;
  otros?: number;
  tiempo?: number;
};

type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "analyzing";

const CameraPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const roomId = "test-room";
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Analysis state will be used when implementing the analysis feature
  const [analysis] = useState<AnalysisResults | null>({
    pasto: 0,
    tierra: 0,
    otros: 0,
    tiempo: 0,
  });

  // Handle remote stream when it becomes available
  const handleVideoClick = useCallback(() => {
    if (videoRef.current && remoteStreamRef.current) {
      videoRef.current.srcObject = remoteStreamRef.current;
      videoRef.current.play().catch((e) => {
        console.error("Error playing video:", e);
        setError("Failed to play video stream");
        setStatus("error");
      });
    }
  }, []);

  useEffect(() => {
    handleVideoClick();
  }, [handleVideoClick]);

  useEffect(() => {
    // Conéctate al servidor de señalización usando la IP de la red local
    socketRef.current = io("http://localhost:3002/webrtc");
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

  const toggleAnalysis = useCallback(() => {
    setStatus((prev) => {
      const newStatus = prev === "analyzing" ? "connected" : "analyzing";
      console.log(
        `Analysis ${newStatus === "analyzing" ? "started" : "stopped"}`
      );
      return newStatus;
    });
  }, []);

  const setupWebRTC = useCallback(async () => {
    try {
      setStatus("connecting");
      setError(null);
      setStatus("connected");
    } catch (err) {
      console.error("WebRTC setup error:", err);
      setError(err instanceof Error ? err.message : "Failed to setup WebRTC");
      setStatus("error");
    }
  }, []);

  return (
    <div className="relative w-full h-screen bg-gray-900">
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        onClick={handleVideoClick}
      />

      {/* Status overlay */}
      {(status === "connecting" || status === "error") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
          <div className="text-white text-center p-4 rounded-lg">
            {status === "connecting" && (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-2"></div>
                <p>Connecting to video stream...</p>
              </div>
            )}
            {status === "error" && error && (
              <div className="text-red-400">
                <p className="font-bold">Error:</p>
                <p>{error}</p>
                <button
                  onClick={setupWebRTC}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analysis results overlay */}
      {analysis && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white p-3 rounded">
          <h3 className="font-bold mb-2">Analysis Results</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              Pasto:{" "}
              <span className="font-mono">
                {analysis.pasto?.toFixed(2) ?? "0.00"}%
              </span>
            </div>
            <div>
              Tierra:{" "}
              <span className="font-mono">
                {analysis.tierra?.toFixed(2) ?? "0.00"}%
              </span>
            </div>
            <div>
              Otros:{" "}
              <span className="font-mono">
                {analysis.otros?.toFixed(2) ?? "0.00"}%
              </span>
            </div>
            {analysis.tiempo !== undefined && (
              <div className="col-span-2 text-sm opacity-75">
                Tiempo: {analysis.tiempo.toFixed(2)}ms
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex space-x-2">
        <button
          onClick={setupWebRTC}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Retry Connection
        </button>
        <button
          onClick={toggleAnalysis}
          className={`px-4 py-2 rounded ${
            status === "analyzing"
              ? "bg-red-600 hover:bg-red-700"
              : "bg-blue-600 hover:bg-blue-700"
          } text-white transition-colors`}
        >
          {status === "analyzing" ? "Stop Analysis" : "Start Analysis"}
        </button>
      </div>
    </div>
  );
};

export default React.memo(CameraPage);
