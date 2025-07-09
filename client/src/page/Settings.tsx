"use client";
import SwitchControl from "./SwitchMode";

import { useState } from "react";

export default function Settings() {
  const [mass, setMass] = useState(1.1);
  const [armLength, setArmLength] = useState(0.223);

  const [kc, setKc] = useState<{ [key: string]: number }>({
    "Kc_at[0][0]": 2.1,
    "Kc_at[1][1]": 1.92,
    "Kc_at[2][2]": 5.3,
    "Kc_at[0][3]": 0.58,
    "Kc_at[1][4]": 0.38,
    "Kc_at[2][5]": 1.6,
  });

  const [ki, setKi] = useState<{ [key: string]: number }>({
    "Ki_at[0][0]": 0.04,
    "Ki_at[1][1]": 0.09,
    "Ki_at[2][2]": 0.01,
  });

  const [recording, setRecording] = useState(false);

  const handleKcChange = (key: string, value: string) => {
    setKc((prev) => ({
      ...prev,
      [key]: parseFloat(value),
    }));
  };

  const handleKiChange = (key: string, value: string) => {
    setKi((prev) => ({
      ...prev,
      [key]: parseFloat(value),
    }));
  };

  const startRecording = async () => {
    if (recording) return;

    setRecording(true);

    try {
      const response = await fetch("http://localhost:3002/start-recording", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Kc: kc,
          Ki: ki,
          mass,
          armLength,
        }),
      });

      const data = await response.json();
      console.log("🚀 Grabación iniciada, flightId:", data.flightId);

      // Stop the recording automatically after 20 seconds
      setTimeout(() => {
        setRecording(false);
        console.log(
          "⏹️ Grabación detenida automáticamente después de 20 segundos"
        );
      }, 20000); // 20 seconds in milliseconds
    } catch (error) {
      console.error("❌ Error al iniciar grabación:", error);
      setRecording(false);
    }
  };

  return (
    <div className="p-6 text-white max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-center">
        ⚙️ Configuración del Dron
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Flight data */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">
            ✈️ Datos de Vuelo
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block mb-2 font-medium">Masa (kg)</label>
              <input
                type="number"
                value={mass}
                onChange={(e) => setMass(parseFloat(e.target.value))}
                className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block mb-2 font-medium">
                Longitud del Brazo (m)
              </label>{" "}
              <input
                type="number"
                value={armLength}
                onChange={(e) => setArmLength(parseFloat(e.target.value))}
                disabled={recording}
                className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Switching mode */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide border-b border-gray-600 pb-2">
            Modo de Conmutación
          </h2>
          <SwitchControl />
        </div>

        {/* Matrices LQR */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg col-span-2">
          <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">
            🧮 Matrices LQR (Kc y Ki)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Inputs de Ki */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Matriz Ki</h3>
              <div className="space-y-3">
                {Object.keys(ki).map((key) => (
                  <div key={key}>
                    <label className="block text-sm mb-1">{key}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ki[key]}
                      onChange={(e) => handleKiChange(key, e.target.value)}
                      className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Inputs de Kc */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Matriz Kc</h3>
              <div className="space-y-3">
                {Object.keys(kc).map((key) => (
                  <div key={key}>
                    <label className="block text-sm mb-1">{key}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={kc[key]}
                      onChange={(e) => handleKcChange(key, e.target.value)}
                      className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Record button */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={startRecording}
          disabled={recording}
          className={`px-8 py-3 rounded-lg text-white font-semibold shadow-lg transition ${
            recording
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 focus:ring-2 focus:ring-green-500"
          }`}
        >
          {recording ? "Grabando..." : "🎥 Grabar Vuelo (20s)"}
        </button>
      </div>
    </div>
  );
}
