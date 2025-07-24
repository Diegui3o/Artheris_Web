import React, { useState, useEffect, useRef, useCallback } from "react";
import { Socket, io } from "socket.io-client";

interface JoinRoomResponse {
  success: boolean;
  message: string;
  room: string;
  clients?: string[];
}

interface AnalysisResult {
  pasto: number;
  tierra: number;
  otros: number;
  resolucion?: string;
  tiempo?: number;
}

interface ServerError {
  error: string;
}

interface WebRTCConfig extends RTCConfiguration {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize?: number;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
  // sdpSemantics ha sido eliminado ya que no es parte del estándar RTCConfiguration
}

const WEBRTC_URL =
  import.meta.env.VITE_WEBRTC_URL || "http://localhost:3002/webrtc";
const ROOM_ID = import.meta.env.VITE_ROOM_ID || "drone-room-1";
const ANALYSIS_INTERVAL = 1000; // 1 frame por segundo
const ICE_CONFIG: WebRTCConfig = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // Descomenta y configura tu servidor TURN si lo tienes
    // {
    //   urls: "turn:your-turn-server.com:3478",
    //   username: "username",
    //   credential: "password"
    // },
  ],
  iceTransportPolicy: "all", // Intenta con "relay" si estás detrás de un NAT estricto
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle" as RTCBundlePolicy,
  rtcpMuxPolicy: "require" as RTCRtcpMuxPolicy,
  // sdpSemantics ha sido eliminado ya que no es parte del estándar
};

const CameraPage: React.FC = () => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<
    "idle" | "connecting" | "active" | "error"
  >("idle");
  const [streamSource, setStreamSource] = useState<"webrtc" | "webcam" | null>(
    null
  );

  // 1. Configuración WebRTC y Socket.IO
  const setupWebRTC = useCallback(async () => {
    let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
    let socket: Socket | null = null;
    let pc: RTCPeerConnection | null = null;

    const cleanup = () => {
      console.log("Realizando limpieza...");
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      if (socket) {
        socket.off();
        socket.disconnect();
      }
      if (pc) {
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.ontrack = null;
        pc.close();
      }
    };

    try {
      setStatus("connecting");
      setError("");

      // 1. Configurar Socket.IO
      console.log("Iniciando conexión con el servidor en:", WEBRTC_URL);
      socket = io(WEBRTC_URL, {
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        transports: ["websocket"],
        autoConnect: true,
        forceNew: true
      });
      socketRef.current = socket;

      // 2. Crear conexión WebRTC
      console.log("Creando nueva conexión RTCPeerConnection");
      pc = new RTCPeerConnection(ICE_CONFIG);
      peerConnectionRef.current = pc;

      // 3. Configurar manejadores de eventos de WebRTC
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log("Enviando candidato ICE:", event.candidate.candidate?.substring(0, 50) + "...");
          socket.emit("candidate", {
            candidate: event.candidate,
            roomId: ROOM_ID,
          });
        } else if (!event.candidate) {
          console.log("No hay más candidatos ICE");
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("Estado de conexión ICE:", pc?.iceConnectionState);
        if (pc) {
          switch (pc.iceConnectionState) {
            case "connected":
              console.log("Conexión WebRTC establecida correctamente");
              if (connectionTimeout) clearTimeout(connectionTimeout);
              setStatus("active");
              break;
            case "failed":
              console.error("Error en la conexión ICE");
              setError("Error en la conexión de red");
              setStatus("error");
              pc.restartIce();
              break;
            case "disconnected":
              console.warn("Conexión WebRTC desconectada");
              setStatus("idle");
              break;
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log("Estado de recolección ICE:", pc?.iceGatheringState);
      };

      pc.onsignalingstatechange = () => {
        console.log("Estado de señalización:", pc?.signalingState);
      };

      pc.onconnectionstatechange = () => {
        console.log("Estado de conexión:", pc?.connectionState);
      };

      // 4. Configurar manejadores de eventos del socket
      const onConnect = () => {
        console.log("✅ Conectado al servidor de señalización");
        console.log("🔗 Uniéndose a la sala:", ROOM_ID);
        
        socket?.emit("join", ROOM_ID, (response: JoinRoomResponse) => {
          if (!response) {
            console.error("No se recibió respuesta del servidor");
            setError("Error de comunicación con el servidor");
            setStatus("error");
            return;
          }
          
          console.log("Respuesta del servidor:", response);
          
          if (!response.success) {
            const errorMsg = response.message || "Error desconocido";
            console.error(`❌ Error al unirse a la sala: ${errorMsg}`);
            setError(`Error al unirse a la sala: ${errorMsg}`);
            setStatus("error");
          } else {
            console.log("✅ Unido exitosamente a la sala");
          }
        });
      };

      const onConnectError = (error: Error) => {
        console.error("❌ Error de conexión con el servidor:", error);
        setError(`No se pudo conectar al servidor: ${error.message}`);
        setStatus("error");
      };

      const onDisconnect = (reason: string) => {
        console.log("🔌 Desconectado del servidor. Razón:", reason);
        setStatus("idle");
        
        if (reason === "io server disconnect") {
          console.log("🔄 Intentando reconectar...");
          setTimeout(() => {
            socket?.connect();
          }, 2000);
        }
      };

      // Configurar manejadores de eventos del socket
      socket.on("connect", onConnect);
      socket.on("connect_error", onConnectError);
      socket.on("disconnect", onDisconnect);

      // Manejar resultados de análisis
      socket.on("analysis-result", (data: AnalysisResult) => {
        console.log("📊 Resultado de análisis recibido");
        setAnalysis(data);
        setStatus("active");
      });

      socket.on("analysis-error", (err: ServerError) => {
        console.error("❌ Error en el análisis:", err.error);
        setError(`Error en el análisis: ${err.error}`);
        setStatus("error");
      });

      // Manejar oferta SDP del servidor
      socket.on("offer", async (offer: RTCSessionDescriptionInit) => {
        console.log("Received offer:", offer);
        try {
          console.log("Setting remote description...");
          await pc.setRemoteDescription(new RTCSessionDescription(offer));

          console.log("Creating answer...");
          const answer = await pc.createAnswer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: false,
          });

          console.log("Setting local description...");
          await pc.setLocalDescription(answer);

          console.log("Sending answer to server...");
          socket.emit(
            "answer",
            {
              sdp: answer.sdp,
              type: answer.type,
              roomId: ROOM_ID,
            },
            (response: { success: boolean; error?: string }) => {
              if (response && !response.success) {
                console.error("Error sending answer:", response.error);
                setError(`Error al enviar respuesta: ${response.error}`);
                setStatus("error");
              } else {
                console.log("Answer sent successfully");
              }
            }
          );
        } catch (err) {
          const error = err as Error;
          console.error("Error handling offer:", error);
          setError(`Error en la conexión WebRTC: ${error.message}`);
          setStatus("error");
        }
      });

      // Configurar manejo de tracks de video
      if (pc) {
        pc.ontrack = (event) => {
          console.log("🎥 Track recibido:", event.track.kind);
          if (event.streams && event.streams[0] && videoRef.current) {
            console.log("📹 Configurando fuente de video...");
            streamRef.current = event.streams[0];
            videoRef.current.srcObject = event.streams[0];
            setStreamSource("webrtc");
            
            videoRef.current.onloadedmetadata = () => {
              console.log("✅ Metadatos de video cargados");
              videoRef.current?.play().catch(e => {
                console.error("❌ Error al reproducir video:", e);
                setError('Error al reproducir el video: ' + (e as Error).message);
                setStatus("error");
              });
            };
            
            videoRef.current.onplay = () => {
              console.log("▶️ Reproducción de video iniciada");
              setStatus("active");
            };
            
            videoRef.current.onerror = (e) => {
              console.error("❌ Error en el elemento de video:", e);
              setError('Error en el reproductor de video');
              setStatus("error");
            };
          }
        };
      }

      // Configurar timeout de conexión
      connectionTimeout = setTimeout(() => {
        if (pc && pc.iceConnectionState !== "connected" && status === "connecting") {
          console.error("⏱️ Timeout - No se pudo establecer la conexión ICE");
          setError("No se pudo establecer la conexión. Verifica tu red o inténtalo de nuevo.");
          setStatus("error");
          
          // Intentar reconectar automáticamente
          setTimeout(() => {
            console.log("🔄 Intentando reconectar...");
            setupWebRTC();
          }, 3000);
        }
      }, 15000); // 15 segundos de timeout

      // Función de limpieza
      return () => {
        console.log("🧹 Limpiando recursos de WebRTC...");
        cleanup();
      };
    } catch (err) {
      const error = err as Error;
      console.error("❌ Error en la configuración de WebRTC:", error);
      setError(`Error al conectar con el servidor: ${error.message}`);
      setStatus("error");
      
      // Limpiar recursos en caso de error
      cleanup();
      
      // Intentar reconectar después de un error
      setTimeout(() => {
        console.log("🔄 Intentando reconectar después de un error...");
        setupWebRTC();
      }, 5000);
    }
  }, [status]); // Asegúrate de incluir todas las dependencias necesarias

  // 2. Configuración de webcam local
  const setupLocalWebcam = useCallback(async () => {
    try {
      setStatus("connecting");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setStreamSource("webcam");
        setStatus("active");
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setError("No se pudo acceder a la cámara");
      setStatus("error");
    }
  }, []);

  // 3. Procesamiento de frames
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx || video.readyState !== 4) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    if (imageData) {
      socketRef.current.emit("process-frame", {
        image: imageData,
        roomId: ROOM_ID,
      });
    }
  }, []);

  // 4. Manejo del análisis
  const toggleAnalysis = useCallback(() => {
    if (status === "active") {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      setStatus("idle");
    } else {
      analysisIntervalRef.current = setInterval(
        processFrame,
        ANALYSIS_INTERVAL
      );
    }
  }, [status, processFrame]);

  // 5. Limpieza
  useEffect(() => {
    setupWebRTC();

    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [setupWebRTC]);

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <header className="border-b-2 border-gray-200 pb-4 mb-6">
        <h1 className="text-2xl font-bold">Análisis de Video en Tiempo Real</h1>
      </header>

      <div className="relative mb-6">
        <div className="relative">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full max-w-2xl border border-gray-300 rounded-lg shadow-sm"
            onCanPlay={() => console.log("Video can play")}
            onPlay={() => console.log("Video play event triggered")}
            onError={(e) => {
              console.error("Video error:", e);
              const video = e.target as HTMLVideoElement;
              console.error("Video error details:", {
                error: video.error,
                readyState: video.readyState,
                networkState: video.networkState,
                src: video.currentSrc,
                srcObject: video.srcObject,
              });
            }}
          />
          {status === "connecting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
              Conectando...
            </div>
          )}
          {status === "error" && error && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500 bg-opacity-80 text-white p-4">
              {error}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <button
          onClick={toggleAnalysis}
          disabled={status !== "active"}
          className={`px-4 py-2 rounded-md text-white font-medium ${
            status === "active"
              ? analysisIntervalRef.current
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          {analysisIntervalRef.current
            ? "Detener Análisis"
            : "Iniciar Análisis"}
        </button>

        <button
          onClick={setupLocalWebcam}
          disabled={streamSource === "webcam"}
          className={`px-4 py-2 rounded-md font-medium ${
            streamSource === "webcam"
              ? "bg-blue-600 text-white"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          Usar Webcam Local
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p>{error}</p>
        </div>
      )}

      {analysis && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold mb-2">
            Resultados del Análisis
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 p-3 rounded">
              <p className="text-sm text-green-600">Pasto</p>
              <p className="text-xl font-bold">{analysis.pasto}%</p>
            </div>
            <div className="bg-amber-50 p-3 rounded">
              <p className="text-sm text-amber-600">Tierra</p>
              <p className="text-xl font-bold">{analysis.tierra}%</p>
            </div>
            <div className="bg-gray-100 p-3 rounded">
              <p className="text-sm text-gray-600">Otros</p>
              <p className="text-xl font-bold">{analysis.otros}%</p>
            </div>
          </div>
          {analysis.resolucion && (
            <p className="text-xs text-gray-500 mt-2">
              Resolución: {analysis.resolucion} | Tiempo:{" "}
              {analysis.tiempo
                ? new Date(analysis.tiempo * 1000).toLocaleTimeString()
                : "N/A"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CameraPage;
