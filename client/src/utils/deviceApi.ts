import { DeviceProfile, Vuelo } from "../types";

export async function fetchDevices(): Promise<DeviceProfile[]> {
  const res = await fetch("http://localhost:3002/api/devices");
  if (!res.ok) throw new Error("No se pudo obtener la lista de dispositivos conectados");
  return res.json();
}

// Get the profile of a device by ID
export async function fetchDeviceProfile(deviceId: string): Promise<DeviceProfile> {
  const res = await fetch(`http://localhost:3002/api/profile/${deviceId}`);
  if (!res.ok) throw new Error("No se pudo obtener el perfil del dispositivo");
  return res.json();
}

// Update the profile of a device
export async function updateDeviceProfile(deviceId: string, nombre: string, skin: string): Promise<DeviceProfile> {
  const res = await fetch(`http://localhost:3002/api/profile/${deviceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, skin })
  });
  if (!res.ok) throw new Error("No se pudo actualizar el perfil del dispositivo");
  return res.json();
}

// Obtain a device's flight history
export async function fetchDeviceFlights(deviceId: string): Promise<Vuelo[]> {
  const res = await fetch(`http://localhost:3002/api/flights/${deviceId}`);
  if (!res.ok) throw new Error("No se pudo obtener el historial de vuelos");
  return res.json();
}
