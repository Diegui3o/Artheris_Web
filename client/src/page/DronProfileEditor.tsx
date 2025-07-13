import { useState } from "react";
import type { DeviceProfile } from "../types";

interface Props {
  deviceProfile: DeviceProfile;
  onProfileUpdate: (nuevoNombre: string) => void;
}

export default function DronProfileEditor({
  deviceProfile,
  onProfileUpdate,
}: Props) {
  const [nombre, setNombre] = useState(deviceProfile.nombre);
  const [editando, setEditando] = useState(false);

  return (
    <div className="bg-gray-900 rounded p-6 shadow w-full max-w-md">
      <h2 className="text-xl font-bold mb-2 text-white">Perfil de dron</h2>
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-1 rounded bg-blue-800 text-blue-100 text-xs">
          ID: {deviceProfile.id}
        </span>
        <span className="px-2 py-1 rounded bg-green-800 text-green-100 text-xs">
          Skin: {deviceProfile.skin}
        </span>
      </div>
      <div className="mb-3">
        <label className="block text-gray-300 text-sm mb-1">Nombre:</label>
        {editando ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onProfileUpdate(nombre);
              setEditando(false);
            }}
            className="flex gap-2"
          >
            <input
              className="px-2 py-1 rounded bg-gray-800 text-white border border-gray-700"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              minLength={2}
            />
            <button
              type="submit"
              className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
            >
              Guardar
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded bg-gray-600 text-white hover:bg-gray-700"
              onClick={() => {
                setNombre(deviceProfile.nombre);
                setEditando(false);
              }}
            >
              Cancelar
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-white text-lg font-semibold">
              {deviceProfile.nombre}
            </span>
            <button
              className="px-2 py-1 rounded bg-blue-700 text-white hover:bg-blue-800 text-xs"
              onClick={() => setEditando(true)}
            >
              Editar
            </button>
          </div>
        )}
      </div>
      <div className="text-gray-300 text-sm mb-2">
        Última conexión:{" "}
        {deviceProfile.ultimaConexion
          ? new Date(deviceProfile.ultimaConexion).toLocaleString()
          : "-"}
      </div>
      <div className="text-gray-400 text-xs">
        Registrado: {deviceProfile.registrado ? "Sí" : "No"}
      </div>
    </div>
  );
}
