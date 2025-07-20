import type { Vuelo } from "../types";

// The data type of each flight
type DatosVuelo = {
  InputThrottle?: number | string;
  Altitude?: number;
  [key: string]: number | string | undefined;
};

type VueloConDatos = Vuelo & {
  datos?: DatosVuelo[];
  duracion?: number | string;
};

function TiempoVueloInputThrottle({ vuelos }: { vuelos: VueloConDatos[] }) {
  let totalSegundos = 0;
  let muestras = 0;
  vuelos.forEach((vuelo) => {
    if (Array.isArray(vuelo.datos)) {
      vuelo.datos.forEach((d) => {
        const throttle = Number(d.InputThrottle);
        if (throttle >= 1400 && throttle <= 2000) {
          totalSegundos += 1;
        }
        muestras++;
      });
    }
  });
  const minutos = (totalSegundos / 60).toFixed(1);
  return (
    <div className="text-gray-200 text-sm">
      <b>Flight time (InputThrottle 1400-2000):</b>{" "}
      {muestras > 0 ? `${minutos} min` : "--"}
    </div>
  );
}

function DetallesInteresantes({ vuelos }: { vuelos: VueloConDatos[] }) {
  const numVuelos = vuelos.length;
  let maxAltura = 0;
  let maxDuracion = 0;
  vuelos.forEach((vuelo) => {
    if (Array.isArray(vuelo.datos)) {
      (vuelo.datos ?? []).forEach((d) => {
        if (typeof d.Altitude === "number" && d.Altitude > maxAltura)
          maxAltura = d.Altitude;
      });
    }
    if (vuelo.duracion) {
      const dur =
        typeof vuelo.duracion === "string"
          ? parseFloat(vuelo.duracion)
          : vuelo.duracion;
      if (typeof dur === "number" && dur > maxDuracion) maxDuracion = dur;
    }
  });
  return (
    <div className="mt-3 text-gray-300 text-sm">
      <div>
        <b>Number of flights:</b> {numVuelos}
      </div>
      <div>
        <b>Maximum registered height:</b> {maxAltura ? `${maxAltura} m` : "--"}
      </div>
      <div>
        <b>Longer flight:</b>{" "}
        {maxDuracion ? `${(maxDuracion / 60).toFixed(1)} min` : "--"}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import type { DeviceProfile } from "../types";
import {
  fetchDeviceProfile,
  updateDeviceProfile,
  fetchDeviceFlights,
} from "../utils/deviceApi";

interface DeviceProfileProps {
  deviceId: string;
}

const DeviceProfile: React.FC<DeviceProfileProps> = ({ deviceId }) => {
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(
    null
  );
  const [flights, setFlights] = useState<VueloConDatos[]>([]);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargandoPerfil(true);
    setError(null);
    fetchDeviceProfile(deviceId)
      .then((profile: DeviceProfile) => {
        setDeviceProfile(profile);
        setNuevoNombre(profile.nombre || "");
        setCargandoPerfil(false);
      })
      .catch(() => {
        setError("The device profile could not be loaded");
        setCargandoPerfil(false);
      });
    fetchDeviceFlights(deviceId)
      .then((result: VueloConDatos[] | { flights: VueloConDatos[] }) => {
        if (Array.isArray(result)) {
          setFlights(result);
        } else if (
          result &&
          Array.isArray((result as { flights?: VueloConDatos[] }).flights)
        ) {
          setFlights((result as { flights: VueloConDatos[] }).flights);
        } else {
          setFlights([]);
        }
      })
      .catch(() => setFlights([]));
  }, [deviceId]);

  const handleSave = async () => {
    if (!deviceProfile) return;
    setCargandoPerfil(true);
    setMensaje(null);
    setError(null);
    try {
      const updated = await updateDeviceProfile(
        deviceProfile.id,
        nuevoNombre,
        deviceProfile.skin || ""
      );
      setDeviceProfile((prev) =>
        prev ? { ...prev, Name: updated.nombre } : prev
      );
      setMensaje("Updated profile");
    } catch {
      setError("Error when updating the profile");
    } finally {
      setCargandoPerfil(false);
    }
  };

  if (cargandoPerfil && !deviceProfile) {
    return <div className="text-gray-200 p-6">Loading profile...</div>;
  }

  if (error) {
    return <div className="text-red-400 p-6">{error}</div>;
  }

  if (!deviceProfile) {
    return (
      <div className="text-gray-400 p-6">
        Select a device to see the profile.
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 bg-gray-900 rounded-xl shadow-lg mt-6 relative">
      <h2 className="text-2xl font-bold text-white mb-2">
        {deviceProfile.nombre}
        {deviceProfile.conectado && (
          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-400 border-2 border-white/80 flex items-center justify-center text-xs text-white font-bold">
            ●
          </span>
        )}
      </h2>
      <div className="text-gray-200 text-sm mb-1">
        <b>ID:</b> {deviceProfile.id}
      </div>
      <div className="text-gray-200 text-sm mb-1">
        <b>Firmware:</b> {deviceProfile.firmware || "--"}
      </div>
      <input
        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white font-bold text-lg mb-1 w-full"
        value={nuevoNombre}
        disabled={cargandoPerfil}
        onChange={(e) => setNuevoNombre(e.target.value)}
        placeholder="Nombre del dispositivo"
      />
      <input
        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm mb-1 w-full"
        value={deviceProfile.descripcion ?? ""}
        onChange={(e) =>
          setDeviceProfile((prev) =>
            prev ? { ...prev, description: e.target.value } : prev
          )
        }
        placeholder="Description"
      />
      <input
        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs w-full"
        value={deviceProfile.propietario ?? ""}
        onChange={(e) =>
          setDeviceProfile((prev) =>
            prev ? { ...prev, owner: e.target.value } : prev
          )
        }
        placeholder="Owner"
      />
      <button
        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-60 mt-2"
        disabled={nuevoNombre === deviceProfile.nombre || cargandoPerfil}
        onClick={handleSave}
      >
        Save
      </button>
      {mensaje && <div className="text-green-400 mt-2">{mensaje}</div>}
      {error && <div className="text-red-400 mt-2">{error}</div>}
      {flights.length === 0 && (
        <div className="text-yellow-400 mt-4">
          This device has not yet registered flights.
        </div>
      )}
      <TiempoVueloInputThrottle vuelos={flights} />
      <DetallesInteresantes vuelos={flights} />
    </div>
  );
};

export default DeviceProfile;
