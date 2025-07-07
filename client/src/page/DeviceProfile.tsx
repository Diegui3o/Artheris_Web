import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchDeviceProfile, fetchDeviceFlights, updateDeviceProfile } from "../utils/deviceApi";
import { DeviceProfile, Vuelo } from "../types";
import { parseDuracion } from "../utils/profileStats";

const LOGROS: { nombre: string }[] = [
  { nombre: "Primer vuelo" },
  { nombre: "5 vuelos" },
  { nombre: "10 min en el aire" },
  { nombre: "Firmware actualizado" },
];

const DeviceProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // deviceProfile reemplaza a profile para consistencia con el frontend
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null);
  const [historial, setHistorial] = useState<Vuelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState<string>("");
  const [cargandoPerfil, setCargandoPerfil] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([fetchDeviceProfile(id), fetchDeviceFlights(id)])
      .then(([profileData, flightsData]) => {
        setDeviceProfile(profileData);
        if (Array.isArray(flightsData)) {
          setHistorial(flightsData);
        } else if (
          flightsData &&
          Array.isArray((flightsData as { flights?: Vuelo[] }).flights)
        ) {
          setHistorial((flightsData as { flights: Vuelo[] }).flights);
        } else {
          setHistorial([]);
        }
        setError(null);
      })
      .catch(() => {
        setError("No se pudo cargar el perfil del dispositivo");
        setDeviceProfile(null);
        setHistorial([]);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-center">Cargando...</div>;
  if (error) return <div className="p-6 text-center text-red-400">{error}</div>;
  if (!deviceProfile)
    return <div className="p-6 text-center">Dispositivo no encontrado</div>;

  // Mostrar mensaje si existe
  // (no usamos return temprano para no romper el layout)
  return (
    <>
      {mensaje && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-2 rounded-xl shadow-lg z-50">
          {mensaje}
        </div>
      )}
      <div className="max-w-2xl mx-auto p-6 bg-gray-900 rounded-xl shadow-lg mt-6">
        <button
          className="mb-4 px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-800"
          onClick={() => navigate(-1)}
        >
          ← Volver
        </button>
        <div className="flex items-center gap-4 mb-4">
          <span
            className={`inline-block w-3 h-3 rounded-full ${deviceProfile?.conectado ? "bg-green-400" : "bg-red-400"}`}
          />
          <h2 className="text-2xl font-bold text-white">{deviceProfile?.nombre}</h2>
          <span className="ml-auto px-2 py-0.5 rounded text-xs font-mono tracking-widest shadow bg-black/40 text-green-200">
            {deviceProfile?.conectado ? "Conectado" : "Desconectado"}
          </span>
        </div>
        {deviceProfile?.descripcion && (
          <div className="text-gray-200 text-sm mb-1">
            <b>Descripción:</b> {deviceProfile.descripcion}
          </div>
        )}
        <div>
          <span className="block text-xs text-gray-400">Último vuelo</span>
          <span className="block text-xl font-bold text-cyan-400">
            {historial.length > 0 ? historial[0].fecha : "--"}
          </span>
        </div>
        <div>
          <span className="block text-xs text-gray-400">Total tiempo</span>
          <span className="block text-xl font-bold text-cyan-400">
            {historial
              .reduce((acc: number, v: Vuelo) => acc + parseDuracion(v.duracion), 0)
              .toFixed(1)}{" "}
            min
          </span>
          </div>
          <div>
            <span className="block text-xs text-gray-400">Total tiempo</span>
            <span className="block text-xl font-bold text-cyan-400">
              {historial
                .reduce((acc: number, v: Vuelo) => acc + parseDuracion(v.duracion), 0)
                .toFixed(1)}{" "}
              min
            </span>
          </div>
        </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-bold text-cyan-300 mb-2">
          Historial de Vuelos
        </h3>
        <div className="max-h-60 overflow-y-auto">
          {historial.length === 0 && (
            <div className="text-gray-400 text-sm">
              No hay vuelos registrados.
            </div>
          )}
          {historial.map((vuelo: Vuelo, i: number) => (
            <div
              key={i}
              className="border-b border-gray-700 py-2 flex flex-col gap-1"
            >
              <span className="text-sm text-white font-bold">
                Vuelo #{i + 1}
              </span>
              <span className="text-xs text-gray-400">
                Fecha: {vuelo.fecha}
              </span>
              <span className="text-xs text-gray-400">
                Duración: {vuelo.duracion}
              </span>
              <span className="text-xs text-gray-400">
                Calificación: {vuelo.calificacion ?? "--"}
              </span>
            </div>
          ))}
          <div className="w-full max-w-xl flex flex-col gap-8 items-center">
            {/* PANEL AVANZADO DE PERFIL DEL ESP32 */}
            <div className="w-full bg-gradient-to-r from-green-800/30 to-blue-900/30 rounded-xl p-4 mb-2 flex flex-col gap-3 border border-green-500/30 shadow">
              <div className="flex items-center gap-3 mb-2">
                <div className="relative">
                  <div
                    className="w-14 h-14 rounded-full border-4 border-white/40 shadow-lg flex items-center justify-center text-2xl font-bold select-none"
                    style={{
                      background: deviceProfile.avatarColor || "#10B981",
                    }}
                  >
                    {deviceProfile.nombre?.[0]?.toUpperCase() || "D"}
                  </div>
                  {deviceProfile.conectado && (
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-400 border-2 border-white/80 flex items-center justify-center text-xs text-white font-bold">
                      ●
                    </span>
                  )}
                </div>
                <div className="flex flex-col flex-1">
                  <input
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white font-bold text-lg mb-1"
                    value={nuevoNombre}
                    disabled={cargandoPerfil}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder="Nombre del dispositivo"
                  />
                  <input
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm mb-1"
                    value={deviceProfile.descripcion ?? ""}
                    onChange={(e) =>
                      setDeviceProfile((prev) =>
                        prev ? { ...prev, descripcion: e.target.value } : prev
                      )
                    }
                    placeholder="Descripción"
                  />
                  <input
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs"
                    value={deviceProfile.propietario ?? ""}
                    onChange={(e) =>
                      setDeviceProfile((prev) =>
                        prev ? { ...prev, propietario: e.target.value } : prev
                      )
                    }
                    placeholder="Propietario"
                  />
                </div>
                <button
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-60"
                  disabled={
                    nuevoNombre === deviceProfile.nombre || cargandoPerfil
                  }
                  onClick={async () => {
                    setCargandoPerfil(true);
                    try {
                      await updateDeviceProfile(
                        deviceProfile.id,
                        nuevoNombre,
                        deviceProfile.skin || ""
                      );
                      setDeviceProfile((prev) =>
                        prev ? { ...prev, nombre: nuevoNombre } : prev
                      );
                      setMensaje("Perfil actualizado");
                      setTimeout(() => setMensaje(null), 2000);
                    } finally {
                      setCargandoPerfil(false);
                    }
                  }}
                >
                  Guardar
                </button>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-white">Color de avatar:</span>
                <input
                  type="color"
                  className="w-8 h-8 p-0 border-none rounded-full cursor-pointer"
                  value={deviceProfile.avatarColor || "#10B981"}
                  onChange={(e) =>
                    setDeviceProfile((prev) =>
                      prev ? { ...prev, avatarColor: e.target.value } : prev
                    )
                  }
                />
                <span className="ml-auto text-xs text-gray-400">
                  {deviceProfile.conectado ? "Conectado" : "Desconectado"}
                </span>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-white text-sm">
                  Novedades / Compras recientes
                </label>
                <textarea
                  className="bg-white/10 border border-green-400/40 rounded px-2 py-1 text-green-200 flex-1 min-h-[50px]"
                  value={deviceProfile.notasPrivadas || ""}
                  onChange={(e) =>
                    setDeviceProfile((prev) =>
                      prev ? { ...prev, notasPrivadas: e.target.value } : prev
                    )
                  }
                  placeholder="Ej: Sensor de CO2, batería nueva, hélices reforzadas, etc."
                />
                <button
                  className="bg-green-700 hover:bg-green-800 text-white px-3 py-1 rounded self-end mt-1 disabled:opacity-60"
                  disabled={cargandoPerfil}
                  onClick={async () => {
                    setCargandoPerfil(true);
                    try {
                      await updateDeviceProfile(
                        deviceProfile.id,
                        deviceProfile.nombre,
                        deviceProfile.skin
                      );
                      setMensaje("Novedades guardadas");
                      setTimeout(() => setMensaje(null), 2000);
                    } finally {
                      setCargandoPerfil(false);
                    }
                  }}
                >
                  Guardar novedades
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded"
                  onClick={() =>
                    window.open(`/device/${deviceProfile.id}`, "_blank")
                  }
                >
                  Ver perfil completo
                </button>
                <button
                  className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded"
                  onClick={() => {
                    setHistorial([]);
                    setMensaje("¡Estadísticas reiniciadas!");
                    setTimeout(() => setMensaje(null), 2000);
                  }}
                >
                  Reiniciar estadísticas
                </button>
              </div>
              {/* LOGROS VISUALES */}
              <div className="flex flex-wrap gap-2 mt-4">
                {LOGROS.map((l: { nombre: string }, i: number) => (
                  <span
                    key={i}
                    className="bg-purple-600/30 text-purple-200 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1"
                  >
                    <span className="inline-block w-2 h-2 rounded-full bg-purple-400"></span>
                    {l.nombre}
                  </span>
                ))}
              </div>
              {/* DETALLES ÚTILES */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="text-xs text-gray-400">
                  <b>Última conexión:</b>{" "}
                  {deviceProfile.ultimaConexion
                    ? new Date(deviceProfile.ultimaConexion).toLocaleString()
                    : "--"}
                </div>
                <div className="text-xs text-gray-400">
                  <b>Firmware:</b> {deviceProfile.firmware || "Desconocido"}
                </div>
              </div>
            </div>
            {/* HISTORIAL DE VUELOS */}
            <div className="rounded-2xl bg-white/10 backdrop-blur-md p-6 shadow-xl border border-white/10 flex flex-col relative overflow-hidden w-full mt-4">
              <h2 className="text-lg font-bold text-white mb-4">
                Historial de Vuelos
              </h2>
              <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-1">
                {historial.map((v: Vuelo, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 bg-black/30 rounded-xl px-4 py-3 shadow border-l-4"
                    style={{ borderColor: i === 0 ? "#10B981" : "#8B5CF6" }}
                  >
                    <div className="flex flex-col flex-1">
                      <span className="text-white font-semibold">
                        {v.fecha}
                      </span>
                      <span className="text-xs text-gray-300">
                        Duración: {v.duracion} · Distancia: {v.distancia}
                      </span>
                    </div>
                    <span className="text-2xl select-none" title="Calificación">
                      {"★".repeat(v.calificacion)}
                      <span className="text-gray-600">
                        {"★".repeat(5 - v.calificacion)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default DeviceProfilePage;
