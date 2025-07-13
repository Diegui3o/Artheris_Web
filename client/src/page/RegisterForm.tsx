import React, { useState } from "react";
import type { DeviceProfile } from "../types";

interface RegisterFormProps {
  device: DeviceProfile;
  onRegistered: (device: DeviceProfile) => void;
}

const SKINS = [
  { name: "azul", color: "#3b82f6" },
  { name: "verde", color: "#10b981" },
  { name: "rojo", color: "#ef4444" },
  { name: "amarillo", color: "#f59e42" },
];

export default function RegisterForm({ device, onRegistered }: RegisterFormProps) {
  const [nombre, setNombre] = useState(device.nombre || "");
  const [skin, setSkin] = useState(device.skin || "azul");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Registra el dron usando solo su DEVICE_ID
      const res = await fetch(`http://localhost:3002/api/drones/${device.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          skin,
          registrado: true
        })
      });
      if (!res.ok) throw new Error("No se pudo registrar el dron");
      const data = await res.json();
      onRegistered(data);
    } catch {
      setError("Error al registrar el dron");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 ml-2">
      <input
        type="text"
        placeholder="Nombre del dron"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        required
        className="px-2 py-1 rounded bg-gray-900 text-white border border-gray-700"
      />
      <div className="flex gap-1">
        {SKINS.map(s => (
          <button
            type="button"
            key={s.name}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${skin === s.name ? "border-green-400" : "border-gray-500"}`}
            style={{ background: s.color }}
            onClick={() => setSkin(s.name)}
            aria-label={`Seleccionar skin ${s.name}`}
          >
            {skin === s.name && <span className="text-white text-xs font-bold">✓</span>}
          </button>
        ))}
      </div>
      <button
        type="submit"
        className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Registrando..." : "Registrar"}
      </button>
      {error && <div className="text-red-400 text-xs mt-1">{error}</div>}
    </form>
  );
}
