import { useEffect, useState } from "react";
import { fetchDevices } from "../utils/deviceApi";

// New function to retrieve all registered drones
async function fetchRegisteredDrones(): Promise<DeviceProfileType[]> {
  const res = await fetch("http://localhost:3002/api/drones");
  if (!res.ok)
    throw new Error("Failed to retrieve the list of registered drones");
  return res.json();
}
import RegisterForm from "./RegisterForm";
import DronProfileEditor from "./DronProfileEditor";
import type { DeviceProfile as DeviceProfileType } from "../types";

function Profile() {
  const [connectedDevices, setConnectedDevices] = useState<DeviceProfileType[]>(
    []
  );
  const [registeredDrones, setRegisteredDrones] = useState<DeviceProfileType[]>(
    []
  );
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfileType | null>(
    null
  );
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    // Fetch connected and registered in parallel
    Promise.all([fetchDevices(), fetchRegisteredDrones()])
      .then(([conectados, registrados]) => {
        setConnectedDevices(
          (conectados || []).filter((d) => d.id && d.id.trim() !== "")
        );
        setRegisteredDrones(
          (registrados || []).filter((d) => d.id && d.id.trim() !== "")
        );
      })
      .catch(() => setMensaje("Error fetching devices or drones"));
  }, []);

  useEffect(() => {
    if (deviceProfile) {
      setDeviceProfile({
        id: deviceProfile.id,
        nombre: `ESP32 ${deviceProfile.id}`,
        skin: "azul",
        conectado: true,
        ultimaConexion: new Date().toISOString(),
        registrado: false,
      });
    } else {
      setDeviceProfile(null);
    }
  }, [deviceProfile]);

  // Connected drones that are NOT registered (only show registration form for these)
  const conectadosNoRegistrados = connectedDevices.filter(
    (d) => !registeredDrones.some((r) => r.id === d.id)
  );

  // All registered drones (may or may not be connected)
  const dronesRegistrados = registeredDrones;

  // Placeholder function to enter the profile
  const entrarAlPerfil = (id: string) => {
    alert(`Entering the profile of ... ${id}`);
  };

  return (
    <div className="flex flex-col items-center p-6">
      {/* Connected and registered drones (can enter) */}
      <h2 className="text-lg font-bold mt-4 mb-2 text-green-400">
        Connected drones
      </h2>
      <ul className="w-full max-w-md mb-4">
        {dronesRegistrados.filter((d) =>
          connectedDevices.some((cd) => cd.id === d.id)
        ).length === 0 && (
          <li className="text-gray-400">No connected registered drones</li>
        )}
        {dronesRegistrados
          .filter((d) => connectedDevices.some((cd) => cd.id === d.id))
          .map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between mb-2 p-2 bg-gray-800 rounded"
            >
              <span>{d.nombre || d.id}</span>
              <button
                className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => entrarAlPerfil(d.id)}
              >
                Log in
              </button>
              <span className="ml-2 px-2 py-0.5 rounded bg-green-700/70 text-green-200 text-xs font-mono tracking-widest shadow">
                Connected
              </span>
            </li>
          ))}
      </ul>

      {/* Connected and NOT registered drones (can register) */}
      <h2 className="text-lg font-bold mt-4 mb-2 text-yellow-400">
        Unregistered connected drones
      </h2>
      <ul className="w-full max-w-md mb-4">
        {conectadosNoRegistrados.length === 0 && (
          <li className="text-gray-400">No unregistered connected drones</li>
        )}
        {conectadosNoRegistrados.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between mb-2 p-2 bg-gray-800 rounded"
          >
            <span>{d.nombre || d.id}</span>
            <RegisterForm
              device={d}
              onRegistered={(nuevo: DeviceProfileType) => {
                setRegisteredDrones((prev: DeviceProfileType[]) => [
                  ...prev,
                  { ...d, ...nuevo },
                ]);
              }}
            />
          </li>
        ))}
      </ul>

      {/* Registered but disconnected drones (cannot enter) */}
      <h2 className="text-lg font-bold mt-4 mb-2 text-red-400">
        Disconnected registered drones
      </h2>
      <ul className="w-full max-w-md">
        {dronesRegistrados.filter(
          (d) => !connectedDevices.some((cd) => cd.id === d.id)
        ).length === 0 && (
          <li className="text-gray-400">No disconnected registered drones</li>
        )}
        {dronesRegistrados
          .filter((d) => !connectedDevices.some((cd) => cd.id === d.id))
          .map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between mb-2 p-2 bg-gray-800 rounded opacity-70"
            >
              <span>{d.nombre || d.id}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-red-700/70 text-red-200 text-xs font-mono tracking-widest shadow">
                Offline
              </span>
            </li>
          ))}
      </ul>
      <div className="flex flex-col items-center mt-6">
        {typeof mensaje === "string" && mensaje && (
          <div className="mt-2 text-sm text-yellow-200 bg-gray-800 px-3 py-1 rounded shadow">
            {mensaje}
          </div>
        )}
      </div>
      <div className="mt-6">
        {deviceProfile ? (
          <DronProfileEditor
            deviceProfile={deviceProfile}
            onProfileUpdate={async (nuevoNombre: string) => {
              try {
                const res = await fetch(
                  `http://localhost:3002/api/drones/${deviceProfile.id}`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ...deviceProfile,
                      Name: nuevoNombre,
                    }),
                  }
                );
                if (!res.ok) throw new Error("No se pudo actualizar el nombre");
                const actualizado = await res.json();
                setDeviceProfile(actualizado);
                setRegisteredDrones((prev: DeviceProfileType[]) =>
                  prev.map((d: DeviceProfileType) =>
                    d.id === actualizado.id
                      ? { ...d, Name: actualizado.nombre }
                      : d
                  )
                );
                setMensaje("Name updated successfully");
              } catch {
                setMensaje("Error updating the name");
              }
              setTimeout(() => setMensaje(null), 1500);
            }}
          />
        ) : (
          <div className="text-gray-400 p-6 text-lg">
            Select a connected ESP32 to view its profile.
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
