import { DeviceProfile, Vuelo } from "../types";

// Obtiene la lista de dispositivos conectados y su estadoexport async function fetchDevices(): Promise<DeviceProfile[]> {
  const res = await fetch("http://localhost:3002/api/devices");
  if (!res.ok) throw new Error("No se pudo obtener la lista de dispositivos");
  return res.json();
}

// Obtiene el perfil de un dispositivo por ID
export async function fetchDeviceProfile(deviceId: string): Promise<DeviceProfile> {
  const res = await fetch(`http://localhost:3002/api/profile/${deviceId}`);
  if (!res.ok) throw new Error("No se pudo obtener el perfil del dispositivo");
  return res.json();
}

// Actualiza el perfil de un dispositivo
export async function updateDeviceProfile(deviceId: string, nombre: string, skin: string): Promise<DeviceProfile> {
  const res = await fetch(`http://localhost:3002/api/profile/${deviceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, skin })
  });
  if (!res.ok) throw new Error("No se pudo actualizar el perfil del dispositivo");
  return res.json();
}

// Obtiene el historial de vuelos de un dispositivo
export async function fetchDeviceFlights(deviceId: string): Promise<Vuelo[]> {
  const res = await fetch(`http://localhost:3002/api/flights/${deviceId}`);
  if (!res.ok) throw new Error("No se pudo obtener el historial de vuelos");
  return res.json();
}
