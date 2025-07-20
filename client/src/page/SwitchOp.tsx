import { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3002");

const ModeSwitch = () => {
  const [modo, setModo] = useState<number>(1);

  const fetchCurrentMode = async () => {
    try {
      const response = await fetch("http://localhost:3002/modo/actual", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Request error: ${response.statusText}`);
      }

      const data = await response.json();

      // Verify if the answer is an object and if you have the property "mode"
      if (data && typeof data === "object" && "modo" in data) {
        setModo(data.modo);
        console.log("Current mode:", data.modo);
      } else {
        throw new Error("Invalid server response");
      }
    } catch (error) {
      console.error("Error retrieving the current mode:", error);
    }
  };

  const cambiarModo = async (nuevoModo: number) => {
    try {
      console.log(`Sending request to switch to mode ${nuevoModo}...`);

      const response = await fetch(`http://localhost:3002/modo/${nuevoModo}`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Request error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data && typeof data === "object" && "modo" in data) {
        setModo(data.modo);
      } else {
        throw new Error("Invalid server response");
      }
    } catch (error) {
      console.error("Error switching mode:", error);
    }
  };

  useEffect(() => {
    fetchCurrentMode();
    socket.on("modo", (nuevoModo: number | null) => {
      // Verify if the newomode is a valid number (0, 1 or 2)
      if (nuevoModo !== null && [0, 1, 2].includes(nuevoModo)) {
        setModo(nuevoModo);
      } else {
        console.warn("⚠️ Received an invalid or null mode, ignoring...");
      }
    });
  }, []);

  return (
    <div className="bg-gray-800 p-4 rounded-xl shadow-md">
      <h2 className="text-lg font-semibold text-white mb-4">
        Current Mode: {modo}
      </h2>
      <select
        className="bg-gray-700 text-white p-2 border border-gray-600 rounded-md"
        value={modo}
        onChange={(e) => {
          const nuevoModo = Number(e.target.value);

          // Verify if the newomode is valid
          if ([0, 1, 2].includes(nuevoModo)) {
            console.log("🔄 Selected Mode:", nuevoModo);
            cambiarModo(nuevoModo);
          } else {
            console.warn("⚠️ Invalid selected mode, ignoring...");
          }
        }}
      >
        <option value={0}>Mode 0 - Pilot Mode</option>
        <option value={1}>Mode 1 - Standby</option>
        <option value={2}>Mode 2 - Manual Mode</option>
      </select>
    </div>
  );
};

export default ModeSwitch;
