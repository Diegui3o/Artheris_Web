import { useState, useRef, useEffect, useCallback } from "react";

const RapidCapture = () => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [fps, setFps] = useState(5); // Fotos por segundo (5 fps ≈ 1 foto cada 200ms)
  const captureCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Método mejorado para captura rápida
  const triggerRapidCapture = useCallback(() => {
    if (!isCapturing) return;

    // Disparador de la cámara nativa
    if (inputRef.current) {
      inputRef.current.value = ""; // Resetear el input
      inputRef.current.click();
      captureCount.current++;
    }
  }, [isCapturing]);

  // Efecto para el intervalo de captura
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isCapturing) {
      interval = setInterval(triggerRapidCapture, 1000 / fps);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCapturing, fps, triggerRapidCapture]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotos((prev) => [
          ...prev.slice(-50),
          event.target?.result as string,
        ]); // Mantener solo las últimas 50 fotos
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Captura Rápida</h1>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <button
          onClick={() => setIsCapturing(!isCapturing)}
          className={`p-3 rounded-lg text-white ${
            isCapturing ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {isCapturing
            ? `Detener (${captureCount.current})`
            : "Iniciar Captura"}
        </button>

        <select
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          className="p-3 border rounded-lg"
          disabled={isCapturing}
        >
          <option value={1}>1 FPS</option>
          <option value={2}>2 FPS</option>
          <option value={5}>5 FPS</option>
          <option value={10}>10 FPS</option>
        </select>
      </div>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        ref={inputRef}
        style={{ display: "none" }}
      />

      <div className="photo-grid">
        {photos.map((photo, index) => (
          <div key={index} className="photo-item">
            <img src={photo} alt={`Captura ${index}`} />
            <span>#{photos.length - index}</span>
          </div>
        ))}
      </div>

      {/* @ts-expect-error: styled-jsx types are not recognized */}
      <style jsx>{`
        .photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 8px;
          margin-top: 16px;
        }
        .photo-item {
          position: relative;
          border: 1px solid #ddd;
          border-radius: 4px;
          overflow: hidden;
        }
        .photo-item img {
          width: 100%;
          height: 120px;
          object-fit: cover;
        }
        .photo-item span {
          position: absolute;
          bottom: 4px;
          right: 4px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
};

export default RapidCapture;
