import { useState } from "react";

export default function ControlPanel() {
  const [ledStatus, setLedStatus] = useState("OFF");

  const toggleLed = async (state: string) => {
    try {
      const endpoint = state === "on" ? "/led/on" : "/led/off";
      const response = await fetch(`http://localhost:3002${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (response.ok) {
        setLedStatus(state.toUpperCase());
      }
    } catch (error) {
      console.error("Error al controlar el LED", error);
    }
  };

  return (
    <div className="flex flex-col items-center bg-gray-900 p-6 rounded-2xl shadow-xl max-w-md mx-auto border border-gray-700">
      <h1 className="text-2xl font-bold text-white mb-4 text-center uppercase tracking-wide">
        Control del LED
      </h1>

      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: ledStatus === "ON" ? "#10B981" : "#DC2626" }}
      ></div>

      <p className="text-gray-400 text-lg mb-4 text-center">
        Estado del LED:{" "}
        <span className="font-bold text-white">{ledStatus}</span>
      </p>

      <div className="flex gap-4">
        <button
          onClick={() => toggleLed("on")}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-all"
        >
          Encender
        </button>
        <button
          onClick={() => toggleLed("off")}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-all"
        >
          Apagar
        </button>
      </div>
    </div>
  );
}
