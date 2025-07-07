import { useEffect, useReducer, useState } from "react";
import { io } from "socket.io-client";
import { calcularEstadisticas } from "../utils/profileStats";
import { DatosSensor, Vuelo, DeviceProfile } from "../types";
import {
  fetchDevices,
  fetchDeviceProfile,
  fetchDeviceFlights,
} from "../utils/deviceApi";
import DeviceSelector from "../components/DeviceSelector";

// --- Estado inicial de historial ---

const SKINS = [
  { name: "Clásico", color: "#10B981" },
  { name: "Rojo", color: "#EF4444" },
  { name: "Azul", color: "#3B82F6" },
  { name: "Naranja", color: "#F59E42" },
  { name: "Morado", color: "#8B5CF6" },
  { name: "Negro", color: "#111827" },
];

const LOGROS = [
  { nombre: "Primer vuelo", icono: "" },
  { nombre: "Vuelo nocturno", icono: "" },
  { nombre: "3km recorridos", icono: "" },
];

// --- Reducer para historial de telemetría ---

// (lastTelemetry y batteryValue deben ir dentro del componente Profile)
type Action = { type: "ADD_DATA"; payload: DatosSensor[] };
const dataReducer = (state: DatosSensor[], action: Action): DatosSensor[] => {
  switch (action.type) {
    case "ADD_DATA":
      return [...state, ...action.payload].slice(-100);
    default:
      return state;
  }
};

function Profile() {
  // --- Estado global de dispositivos ---
  const [devices, setDevices] = useState<DeviceProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(
    null
  );
  const [historial, setHistorial] = useState<Vuelo[]>([]);
  const [data, dispatch] = useReducer(dataReducer, []);
  // Helper para acceder a la última telemetría y valor seguro de batería
  const lastTelemetry = data.length > 0 ? data[data.length - 1] : undefined;
  const batteryValue: number =
    typeof lastTelemetry?.battery === "number" ? lastTelemetry.battery : 88;
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [estadisticas, setEstadisticas] = useState({
    alturaPromedio: 0,
    distanciaTotal: 0,
    tiempoTotal: 0,
    calificacionPromedio: 0,
  });

  // --- Cargar lista de dispositivos ---
  useEffect(() => {
    fetchDevices()
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0) setSelectedId(devs[0].id);
      })
      .catch(() => setDevices([]));
  }, []);

  // --- Cargar perfil e historial del dispositivo seleccionado ---
  useEffect(() => {
    if (!selectedId) return;
    setCargandoPerfil(true);
    Promise.all([
      fetchDeviceProfile(selectedId),
      fetchDeviceFlights(selectedId),
    ])
      .then(
        ([profile, flights]: [
          DeviceProfile,
          Vuelo[] | { flights: Vuelo[] }
        ]) => {
          setDeviceProfile(profile);
          setNuevoNombre(profile.nombre);
          // flights puede ser un array o un objeto con flights
          if (Array.isArray(flights)) {
            setHistorial(flights);
          } else if (
            flights &&
            Array.isArray((flights as { flights?: Vuelo[] }).flights)
          ) {
            setHistorial((flights as { flights: Vuelo[] }).flights);
          } else {
            setHistorial([]);
          }
        }
      )
      .catch(() => {
        setMensaje("No se pudo cargar el perfil del dispositivo");
        setDeviceProfile(null);
        setHistorial([]);
        setTimeout(() => setMensaje(null), 2000);
      })
      .finally(() => setCargandoPerfil(false));
  }, [selectedId]);

  // --- Telemetría en tiempo real solo del dispositivo seleccionado ---
  useEffect(() => {
    if (!selectedId) return;
    const socket = io("http://localhost:3002");
    const handler = (nuevoDato: DatosSensor & { deviceId?: string }) => {
      if (nuevoDato.deviceId === selectedId) {
        dispatch({
          type: "ADD_DATA",
          payload: [{ ...nuevoDato, time: new Date().toLocaleTimeString() }],
        });
      }
    };
    socket.on("sensorUpdate", (data: unknown) =>
      handler(data as DatosSensor & { deviceId?: string })
    );
    socket.on("datosSimulacion", (data: unknown) =>
      handler(data as DatosSensor & { deviceId?: string })
    );
    return () => {
      socket.close();
    };
  }, [selectedId]);

  // --- Estadísticas útiles ---
  useEffect(() => {
    setEstadisticas(calcularEstadisticas(historial, data));
  }, [historial, data]);

  // --- Render ---
  const yaw = typeof lastTelemetry?.yaw === "number" ? lastTelemetry.yaw : 0;
  const rssi =
    typeof lastTelemetry?.rssi === "number" ? lastTelemetry.rssi : undefined;

  function getSignalQuality(rssi?: number): string {
    if (typeof rssi !== "number") return "Desconocida";
    if (rssi >= -60) return "Excelente";
    if (rssi >= -70) return "Buena";
    if (rssi >= -80) return "Regular";
    return "Mala";
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#181c2b] to-[#232946] flex flex-col items-center py-8 px-2">
      {mensaje && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-2 rounded-xl shadow-lg z-50">
          {mensaje}
        </div>
      )}
      <div className="w-full max-w-xl">
        <DeviceSelector
          devices={devices}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      {(!devices || devices.length === 0) && (
        <div className="text-gray-400 italic text-lg mt-12">
          No hay dispositivos disponibles
        </div>
      )}

      {/* FOOTER */}
      <div className="mt-8 text-center text-gray-400 text-sm opacity-80">
        <span>
          Dashboard DronPilot —{" "}
          <span className="text-green-400 font-bold">UNSA</span>
          &nbsp;|&nbsp;
          <span className="text-purple-400">{new Date().getFullYear()}</span>
        </span>
      </div>
    </div>
  );

  // --- Render ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#181c2b] to-[#232946] flex flex-col items-center py-8 px-2">
      {mensaje && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-2 rounded shadow-lg bg-green-700/90 text-white font-semibold text-sm animate-fade-in-out">
          {mensaje}
        </div>
      )}
      {/* CABECERA HOLOGRÁFICA */}
      <div
        className="relative w-full max-w-3xl rounded-3xl bg-white/10 backdrop-blur-md shadow-2xl mb-8 p-6 border border-white/20 flex flex-col md:flex-row items-center gap-8"
        style={{ boxShadow: "0 8px 32px 0 rgba(16,185,129,0.25)" }}
      >
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Dron SVG animado */}
          <svg
            width="180"
            height="180"
            viewBox="0 0 180 180"
            className="drop-shadow-2xl"
            style={{ filter: "blur(0.5px) brightness(1.3)" }}
          >
            <g
              style={{
                transform: `rotate(${yaw}deg)`,
                transformOrigin: "90px 90px",
                transition: "transform 0.4s cubic-bezier(.4,2,.6,1)",
              }}
            >
              <circle
                cx="90"
                cy="90"
                r="64"
                fill="#10B981"
                stroke="#fff"
                strokeWidth="6"
                opacity="0.9"
              />
              <circle
                cx="90"
                cy="90"
                r="40"
                fill="#232946"
                stroke="#10B981"
                strokeWidth="2"
                opacity="0.8"
              />
              {/* Luces LED animadas */}
              {[0, 1, 2, 3].map((i) => (
                <circle
                  key={i}
                  cx={90 + 70 * Math.cos((Math.PI / 2) * i)}
                  cy={90 + 70 * Math.sin((Math.PI / 2) * i)}
                  r="9"
                  fill="#fff"
                  opacity="0.7"
                  className="animate-pulse"
                />
              ))}
              {/* Hélices */}
              {[0, 1, 2, 3].map((i) => (
                <rect
                  key={i}
                  x={85 + 60 * Math.cos((Math.PI / 2) * i)}
                  y={85 + 60 * Math.sin((Math.PI / 2) * i)}
                  width="10"
                  height="32"
                  rx="5"
                  fill="#fff"
                  style={{
                    transform: `rotate(${i * 90}deg)`,
                    transformOrigin: "90px 90px",
                  }}
                  opacity="0.6"
                />
              ))}
            </g>
            <circle
              cx="90"
              cy="90"
              r="80"
              stroke="#10B981"
              strokeWidth="2"
              fill="none"
              opacity="0.3"
            />
            <text
              x="90"
              y="96"
              textAnchor="middle"
              fontSize="18"
              fill="#fff"
              opacity="0.8"
              fontWeight="bold"
            >
              DRON
            </text>
          </svg>
        </div>
        {/* Tarjeta de usuario */}
        <div className="flex-1 flex flex-col gap-2 items-start">
          <div className="flex items-center gap-2">
            {editando ? (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (nuevoNombre.trim().length === 0) {
                    setMensaje("El nombre no puede estar vacío");
                    return;
                  }
                  try {
                    const res = await fetch(
                      "http://localhost:3002/api/profile",
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          nombre: nuevoNombre,
                          skin: deviceProfile ? deviceProfile.skin : "",
                        }),
                      }
                    );
                    if (!res.ok) throw new Error("No se pudo guardar");
                    setNuevoNombre(nuevoNombre);
                    setEditando(false);
                    setMensaje("Nombre actualizado");
                  } catch {
                    setMensaje("Error al guardar el nombre");
                  }
                  setTimeout(() => setMensaje(null), 2000);
                }}
              >
                <input
                  className="bg-transparent border-b-2 border-green-400 text-2xl font-bold text-white outline-none px-1"
                  value={nuevoNombre}
                  autoFocus
                  maxLength={18}
                  aria-label="Editar nombre"
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
                <button
                  type="submit"
                  className="ml-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="ml-1 px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition"
                  onClick={() => {
                    setEditando(false);
                    setNuevoNombre(deviceProfile?.nombre ?? "");
                  }}
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <span
                className="text-2xl font-bold text-white cursor-pointer hover:underline"
                title="Haz click para editar"
                tabIndex={0}
                role="button"
                aria-label="Editar nombre"
                onClick={() => setEditando(true)}
                onKeyDown={(e) => e.key === "Enter" && setEditando(true)}
              >
                {deviceProfile?.nombre ?? ""}
              </span>
            )}
            <span className="ml-2 px-2 py-0.5 rounded bg-green-700/70 text-green-200 text-xs font-mono tracking-widest shadow">
              Nivel 7
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {LOGROS.map((l) => (
              <span
                key={l.nombre}
                title={l.nombre}
                className="text-xl select-none"
              >
                {l.icono}
              </span>
            ))}
          </div>
          <div className="flex gap-2 mt-2 items-center">
            <label className="text-gray-300 text-xs mr-1">Skin:</label>
            <div className="flex gap-1">
              {SKINS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  aria-label={`Seleccionar skin ${s.name}`}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all shadow ${
                    deviceProfile?.skin === s.name
                      ? "border-green-400 scale-110 ring-2 ring-green-300"
                      : "border-gray-500 opacity-70 hover:scale-105"
                  }`}
                  style={{ background: s.color }}
                  onClick={async () => {
                    try {
                      const res = await fetch(
                        "http://localhost:3002/api/profile",
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            nombre: deviceProfile?.nombre ?? "",
                            skin: s.name,
                          }),
                        }
                      );
                      if (!res.ok) throw new Error("No se pudo guardar");
                      setDeviceProfile((prev) =>
                        prev ? { ...prev, skin: s.name } : prev
                      );
                      setMensaje(`Skin cambiado a ${s.name}`);
                    } catch {
                      setMensaje("Error al cambiar skin");
                    }
                    setTimeout(() => setMensaje(null), 1500);
                  }}
                >
                  {deviceProfile?.skin === s.name && (
                    <span className="text-white text-xs font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* HUD circular */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-28 h-28">
            <svg width="112" height="112" viewBox="0 0 112 112">
              <circle
                cx="56"
                cy="56"
                r="50"
                stroke="#222"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="56"
                cy="56"
                r="50"
                stroke="#10B981"
                strokeWidth="8"
                fill="none"
                strokeDasharray={314}
                strokeDashoffset={314 * (1 - batteryValue / 100)}
                style={{ transition: "stroke-dashoffset 0.5s" }}
              />
              <text
                x="56"
                y="62"
                textAnchor="middle"
                fontSize="22"
                fill="#fff"
                fontWeight="bold"
              >
                {batteryValue}%
              </text>
            </svg>
            <span className="absolute left-1/2 -bottom-5 -translate-x-1/2 text-xs text-green-300 bg-black/60 px-2 rounded shadow">
              Batería
            </span>
            <span className="text-xs text-blue-300 bg-black/60 px-2 rounded shadow mb-1">
              Señal WiFi: <b>{getSignalQuality(rssi)}</b>
              {typeof rssi === "number" ? ` (${rssi} dBm)` : ""}
            </span>
            <span className="text-xs text-orange-200 bg-black/60 px-2 rounded shadow">
              Dispositivos conectados: <b>--</b>
            </span>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold shadow ${
              deviceProfile?.conectado
                ? "bg-green-600/80 text-white"
                : "bg-red-600/80 text-white"
            }`}
          >
            {deviceProfile?.conectado ? "Conectado" : "Desconectado"}
          </span>
        </div>
      </div>

      {/* PANEL DE ESTADÍSTICAS ÚTILES */}
      <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div
          className="rounded-2xl bg-white/10 backdrop-blur-md p-6 shadow-xl border border-white/10 flex flex-col items-center relative overflow-hidden"
          style={{ boxShadow: "0 4px 24px 0 rgba(139,92,246,0.12)" }}
        >
          <h2 className="text-lg font-bold text-white mb-2">
            Estadísticas de Vuelo
          </h2>
          {cargandoPerfil ? (
            <div className="text-white">Cargando...</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="bg-black/30 rounded-xl px-4 py-3 flex flex-col items-center">
                <span className="text-gray-400 text-xs">Altura Promedio</span>
                <span className="text-2xl font-bold text-cyan-400">
                  {typeof estadisticas.alturaPromedio === "number"
                    ? estadisticas.alturaPromedio.toFixed(2)
                    : "--"}{" "}
                  m
                </span>
              </div>
              <div className="bg-black/30 rounded-xl px-4 py-3 flex flex-col items-center">
                <span className="text-gray-400 text-xs">Distancia Total</span>
                <span className="text-2xl font-bold text-cyan-400">
                  {typeof estadisticas.distanciaTotal === "number"
                    ? estadisticas.distanciaTotal.toFixed(2)
                    : "--"}{" "}
                  m
                </span>
              </div>
              <div className="bg-black/30 rounded-xl px-4 py-3 flex flex-col items-center">
                <span className="text-gray-400 text-xs">Tiempo Total</span>
                <span className="text-2xl font-bold text-cyan-400">
                  {typeof estadisticas.tiempoTotal === "number"
                    ? estadisticas.tiempoTotal.toFixed(2)
                    : "--"}{" "}
                  min
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-8 text-center text-gray-400 text-sm opacity-80">
        Dashboard DronPilot —{" "}
        <span className="text-green-400 font-bold">Innovador</span> |{" "}
        <span className="text-purple-400">{new Date().getFullYear()}</span>
      </div>
    </div>
  );
}

export default Profile;
