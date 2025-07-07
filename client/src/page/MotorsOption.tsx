import { useState } from "react";

export default function ControlPanel() {
  const [motorStatus, setMotorStatus] = useState("OFF");

  const toggleMotors = async (state: string) => {
    try {
      const endpoint = state === "on" ? "/motores/on" : "/motores/off";
      const response = await fetch(`http://localhost:3002${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (response.ok) {
        setMotorStatus(state.toUpperCase());
      }
    } catch (error) {
      console.error("Error al controlar el LED", error);
    }
  };

  return (
    <div className="flex flex-col items-center bg-gray-900 p-6 rounded-2xl shadow-xl max-w-md mx-auto border border-gray-700">
      <h1 className="text-2xl font-bold text-white mb-4 text-center uppercase tracking-wide">
        Control de Motores
      </h1>

      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{
          backgroundColor: motorStatus === "ON" ? "#3B82F6" : "#F59E0B",
        }}
      ></div>

      <p className="text-gray-400 text-lg mb-4 text-center">
        Estado de los motores:{" "}
        <span className="font-bold text-white">{motorStatus}</span>
      </p>

      <div className="flex gap-4">
        <button
          onClick={() => toggleMotors("on")}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-all"
        >
          Encender
        </button>
        <button
          onClick={() => toggleMotors("off")}
          className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition-all"
        >
          Apagar
        </button>
      </div>
    </div>
  );
}
