import React, { useEffect, useRef, useState, useCallback, memo } from "react";
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
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null); // CORRECCIÓN: Declarar la referencia para el intervalo

  const roomId = "test-room";

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  // CORRECCIÓN: Obtener el setter 'setAnalysis' de useState
  const [analysis, setAnalysis] = useState<AnalysisResults | null>(null);

  // Cleanup WebRTC resources
  const cleanupWebRTC = useCallback(() => {
    console.log("Cleaning up WebRTC resources...");

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      remoteStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

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

  // CORRECCIÓN: Declarar la función para capturar y analizar frames
  const captureAndAnalyzeFrame = useCallback(() => {
    // Aquí iría la lógica para:
    // 1. Dibujar el frame del video en un canvas.
    // 2. Obtener el frame como una imagen (ej. base64).
    // 3. Emitir la imagen a través del socket para su análisis.
    // console.log("Capturing frame for analysis...");
    if (socketRef.current && videoRef.current) {
      // Ejemplo de cómo capturar y enviar (requiere implementación del lado del servidor)
      // const canvas = document.createElement('canvas');
      // canvas.width = videoRef.current.videoWidth;
      // canvas.height = videoRef.current.videoHeight;
      // const ctx = canvas.getContext('2d');
      // ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      // const frame = canvas.toDataURL('image/jpeg');
      // socketRef.current.emit('analyze_frame', { frame, roomId });
    }
  }, []);

  const toggleAnalysis = useCallback(() => {
    setStatus((prev) => {
      const newStatus = prev === "analyzing" ? "connected" : "analyzing";
      console.log(
        `Analysis ${newStatus === "analyzing" ? "started" : "stopped"}`
      );

      if (newStatus === "analyzing") {
        analysisIntervalRef.current = setInterval(captureAndAnalyzeFrame, 500);
      } else {
        if (analysisIntervalRef.current) {
          clearInterval(analysisIntervalRef.current);
          analysisIntervalRef.current = null;
        }
        setAnalysis(null); // Limpiar resultados del análisis
      }
      return newStatus;
    });
  }, [captureAndAnalyzeFrame]);

  // CORRECCIÓN: La lógica principal de conexión se movió a toggleCamera
  // para ser iniciada por el usuario, evitando duplicados y ejecuciones no deseadas.
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      // Turn off camera
      cleanupWebRTC();
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      setStatus("idle");
      setIsCameraOn(false);
      return;
    }

    // Turn on camera
    try {
      setStatus("connecting");
      setError(null);

      // Initialize new connection
      socketRef.current = io("http://localhost:3002/webrtc");
      const socket = socketRef.current;

      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      const pc = peerConnectionRef.current;

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("candidate", { candidate: event.candidate, roomId });
        }
      };

      pc.ontrack = (event) => {
        console.log("Track received:", event.streams[0]);
        remoteStreamRef.current = event.streams[0];
        handleVideoClick();
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State: ${pc.iceConnectionState}`);
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          setError("Connection lost. Please try again.");
          setStatus("error");
          setIsCameraOn(false);
        } else if (pc.iceConnectionState === "connected") {
          setStatus("connected");
          setIsCameraOn(true);
        }
      };

      socket.on("connect", () => {
        console.log("Connected to signaling server, joining room...");
        socket.emit("join", roomId);
      });

      socket.on("offer", async (data: { sdp: string; type: RTCSdpType }) => {
        if (!pc) return;
        try {
          console.log("Offer received, creating answer...");
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", {
            sdp: answer.sdp,
            type: answer.type,
            roomId,
          });
        } catch (e) {
          console.error("Error handling offer:", e);
          setError("Failed to establish connection");
          setStatus("error");
        }
      });

      socket.on("candidate", (data: { candidate: RTCIceCandidateInit }) => {
        if (data.candidate && pc) {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch((e) =>
            console.error("Error adding ICE candidate:", e)
          );
        }
      });
    } catch (err) {
      console.error("Error toggling camera:", err);
      setError("Failed to toggle camera. Please try again.");
      setStatus("error");
      cleanupWebRTC();
    }
  }, [isCameraOn, cleanupWebRTC, handleVideoClick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupWebRTC();
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
    };
  }, [cleanupWebRTC]);

  return (
    <div className="relative w-full h-screen bg-gray-900">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        onClick={handleVideoClick}
      />

      {/* Status overlay */}
      {(status === "connecting" || status === "error" || !isCameraOn) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
          <div className="text-white text-center p-4 rounded-lg">
            {!isCameraOn && status === "idle" && (
              <button
                onClick={toggleCamera} // CORRECCIÓN: Usar toggleCamera
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xl font-bold"
              >
                Start Camera
              </button>
            )}
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
                  onClick={toggleCamera} // CORRECCIÓN: Usar toggleCamera para reintentar
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
      {status === "analyzing" && analysis && (
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
                Analysis time: {analysis.tiempo.toFixed(2)}ms
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      {isCameraOn && (
        <div className="absolute bottom-4 right-4 flex space-x-2">
          <button
            onClick={toggleCamera} // CORRECCIÓN: Botón para detener la cámara
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Stop Camera
          </button>
          <button
            onClick={toggleAnalysis}
            disabled={status === "connecting" || status === "error"}
            className={`px-4 py-2 rounded ${
              status === "analyzing"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
            } text-white transition-colors disabled:opacity-50`}
          >
            {status === "analyzing" ? "Stop Analysis" : "Start Analysis"}
          </button>
        </div>
      )}
    </div>
  );
};

export default memo(CameraPage);
