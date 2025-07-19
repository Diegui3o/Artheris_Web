import React, { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

// Interfaces para tipado estricto
interface AnalysisResult {
  pasto: number;
  tierra: number;
  otros: number;
}

interface ServerError {
  error: string;
}

// Define los eventos del socket
interface ServerToClientEvents {
  'analysis-result': (data: AnalysisResult) => void;
  'analysis-error': (data: ServerError) => void;
  'connect': () => void;
  'offer': (data: { sdp: string; type: RTCSdpType }) => void;
  'candidate': (data: { candidate: RTCIceCandidateInit }) => void;
}

interface ClientToServerEvents {
  'join': (roomId: string) => void;
  'process-frame': (data: { image: string; roomId: string }) => void;
  'answer': (data: { sdp: string; type: RTCSdpType; roomId: string }) => void;
  'candidate': (data: { candidate: RTCIceCandidateInit; roomId: string }) => void;
}

const WEBRTC_URL = 'http://localhost:3002/webrtc';
const ROOM_ID = 'test-room';

const CameraPage: React.FC = () => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // State
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [usingWebcam, setUsingWebcam] = useState<boolean>(false);

  // 1. Conexión al socket y configuración WebRTC
  useEffect(() => {
    // Conectar al namespace de WebRTC
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(WEBRTC_URL);
    socketRef.current = socket;

    // Capturar referencias actuales para limpieza
    const currentVideoRef = videoRef.current;
    const currentSocket = socketRef.current;
    const currentPeerConnection = peerConnectionRef.current;

    // Configurar manejadores de eventos del socket
    socket.on('connect', () => {
      console.log('Conectado al servidor WebRTC con ID:', socket.id);
      socket.emit('join', ROOM_ID);
    });

    socket.on('analysis-result', (result: AnalysisResult) => {
      setAnalysisResult(result);
      setError('');
    });

    socket.on('analysis-error', (data: ServerError) => {
      setError(data.error);
      console.error('Error del servidor:', data.error);
    });

    // Configurar conexión WebRTC
    const createPeerConnection = () => {
      console.log("Creando PeerConnection...");
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log("Enviando candidato ICE:", event.candidate);
          socket.emit("candidate", { candidate: event.candidate, roomId: ROOM_ID });
        }
      };

      pc.ontrack = (event) => {
        console.log("Stream recibido con tracks:", event.streams[0].getTracks());
        remoteStreamRef.current = event.streams[0];
        
        if (currentVideoRef) {
          currentVideoRef.srcObject = event.streams[0];
          currentVideoRef.play().catch((e) => {
            console.error("Error al reproducir video:", e);
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`Estado de conexión ICE: ${pc.iceConnectionState}`);
      };

      peerConnectionRef.current = pc;
    };

    const handleOffer = async (data: { sdp: string; type: RTCSdpType }) => {
      console.log("Oferta recibida del par remoto.");
      if (!peerConnectionRef.current) {
        createPeerConnection();
      }

      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log("Enviando respuesta al par remoto.");
        if (answer.sdp) {
          socket.emit("answer", { 
            sdp: answer.sdp, 
            type: answer.type, 
            roomId: ROOM_ID 
          });
        }
      } catch (e) {
        console.error("Error al manejar la oferta:", e);
      }
    };

    socket.on("offer", handleOffer);

    socket.on("candidate", (data: { candidate: RTCIceCandidateInit }) => {
      if (data.candidate && peerConnectionRef.current) {
        console.log("Candidato ICE recibido:", data.candidate);
        peerConnectionRef.current
          .addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch((e) => {
            console.error("Error al añadir candidato ICE:", e);
          });
      }
    });

    createPeerConnection();

    return () => {
      if (currentSocket) {
        currentSocket.disconnect();
      }
      if (currentPeerConnection) {
        currentPeerConnection.close();
      }
      if (currentVideoRef?.srcObject) {
        const stream = currentVideoRef.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 2. Configurar webcam alternativa
  const setupWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setUsingWebcam(true);
      }
    } catch (err) {
      console.error("Error al acceder a la webcam:", err);
      setError("No se pudo acceder a la cámara. Por favor, otorga los permisos.");
    }
  };

  // 3. Bucle de captura y envío de fotogramas
  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    if (isAnalyzing) {
      intervalId = setInterval(() => {
        if (videoRef.current && canvasRef.current && videoRef.current.readyState === 4) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');

          if (!context) return;

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
          
          if (socketRef.current && base64Image) {
            socketRef.current.emit('process-frame', { 
              image: base64Image,
              roomId: ROOM_ID
            });
          }
        }
      }, 1000); // Analiza 1 fotograma por segundo
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isAnalyzing]);

  // Estilos
  const pageStyles: React.CSSProperties = {
    fontFamily: 'sans-serif',
    textAlign: 'center',
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
  };

  const headerStyles: React.CSSProperties = {
    borderBottom: '2px solid #eee',
    marginBottom: '20px',
  };

  const videoContainerStyles: React.CSSProperties = {
    position: 'relative',
    marginBottom: '20px',
  };

  const videoStyles: React.CSSProperties = {
    width: '100%',
    maxWidth: '640px',
    border: '1px solid #ccc',
    borderRadius: '4px',
  };

  return (
    <div style={pageStyles}>
      <header style={headerStyles}>
        <h1>Análisis de Video del Dron</h1>
      </header>

      <div style={videoContainerStyles}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={videoStyles}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      </div>

      <div>
        <button 
          onClick={() => setIsAnalyzing(!isAnalyzing)} 
          style={{ 
            margin: '10px', 
            padding: '10px 20px',
            backgroundColor: isAnalyzing ? '#ff4444' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {isAnalyzing ? 'Detener Análisis' : 'Iniciar Análisis'}
        </button>

        {!usingWebcam && (
          <button 
            onClick={setupWebcam}
            style={{ 
              margin: '10px', 
              padding: '10px 20px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Usar Webcam Local
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: 'red', margin: '10px 0' }}>
          Error: {error}
        </div>
      )}

      {isAnalyzing && !analysisResult && (
        <p>Esperando primer análisis...</p>
      )}

      {analysisResult && (
        <div style={{ 
          marginTop: '20px', 
          backgroundColor: '#f0f0f0', 
          padding: '15px', 
          borderRadius: '5px',
          textAlign: 'left',
        }}>
          <h3 style={{ color: 'black'}}>Último Resultado del Análisis:</h3>
          <ul style={{ color: 'black', listStyleType: 'none', padding: 0 }}>
            <li><strong>Pasto:</strong> {analysisResult.pasto}%</li>
            <li><strong>Tierra:</strong> {analysisResult.tierra}%</li>
            <li><strong>Otros:</strong> {analysisResult.otros}%</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default CameraPage;