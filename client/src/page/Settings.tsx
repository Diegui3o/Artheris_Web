import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import SwitchControl from "./SwitchOp";
import ControllerSelector from "../components/control/ControllerSelector";
import LQRPanel from "../components/control/LQRPanel";
import PIDPanel from "../components/control/PIDPanel";
import CustomPanel from "../components/control/CustomPanel";
import {
  ControllerConfig,
  ControllerType,
  PIDGains,
  LQRParams,
  CustomParams,
  defaultPID,
  defaultLQR,
  defaultCustom,
  PIDAxisSimple,
  PIDAxisRate,
  PIDAxisCascade,
} from "../types/controller";

type PIDAxis = PIDAxisSimple | PIDAxisRate | PIDAxisCascade;

type KP = {
  angle: number;
  rate: number;
};

type KI = {
  angle: number;
  rate: number;
};

type RecordingStatus = {
  active: boolean;
  remainingMs?: number;
  durationMs?: number;
  flightId?: string | null;
};

const API_BASE =
  import.meta.env.VITE_API_BASE?.toString() || "http://localhost:3002";

export default function Settings() {
  // Flight params
  const [mass, setMass] = useState(1.1);
  const [armLength, setArmLength] = useState(0.223);

  // Controller selection + config
  const [controllerType, setControllerType] = useState<ControllerType>(
    (localStorage.getItem("controllerType") as ControllerType) || "lqr"
  );
  const [controllerConfig, setControllerConfig] = useState<ControllerConfig>(
    () => {
      const cached = localStorage.getItem("controllerConfig");
      if (cached) {
        try {
          return JSON.parse(cached) as ControllerConfig;
        } catch {
          // If JSON parsing fails, we'll use the default LQR config
          // This is fine as it's just a fallback for corrupted localStorage
          return { type: "lqr", params: defaultLQR };
        }
      }
      // por defecto LQR
      return { type: "lqr", params: defaultLQR };
    }
  );

  // Sync selector -> default params (cuando cambias de tipo)
  useEffect(() => {
    let next: ControllerConfig = controllerConfig;
    if (controllerType !== controllerConfig.type) {
      if (controllerType === "pid") next = { type: "pid", params: defaultPID };
      if (controllerType === "lqr") next = { type: "lqr", params: defaultLQR };
      if (controllerType === "custom")
        next = { type: "custom", params: defaultCustom };
      setControllerConfig(next);
    }
    localStorage.setItem("controllerType", controllerType);
    localStorage.setItem("controllerConfig", JSON.stringify(next));
  }, [controllerType, controllerConfig]);

  // Persist cambios de params
  useEffect(() => {
    localStorage.setItem("controllerConfig", JSON.stringify(controllerConfig));
  }, [controllerConfig]);

  // Recording UI (idéntico a tu código con normalizaciones)
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(30);
  const [indefiniteRecording, setIndefiniteRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({
    active: false,
  });
  const [lastFlightId, setLastFlightId] = useState<string | null>(null);

  const statusLabel = useMemo(
    () => (recordingStatus.active ? "Activo" : "Inactivo"),
    [recordingStatus.active]
  );

  useEffect(() => {
    const cached = localStorage.getItem("lastFlightId");
    if (cached) setLastFlightId(cached);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkStatus = async () => {
      if (!isMounted) return;
      try {
        const response = await fetch(`${API_BASE}/recording/recording-status`);
        if (!response.ok) return;
        const raw = await response.json();
        const active = Boolean(raw.active ?? raw.isRecording ?? false);
        let durationMs: number | undefined;
        if (typeof raw.durationMs === "number") durationMs = raw.durationMs;
        else if (typeof raw.recordingDuration === "number")
          durationMs = raw.recordingDuration;
        else if (
          typeof raw.recordingDuration === "string" &&
          raw.recordingDuration.endsWith("ms")
        ) {
          const parsed = Number(raw.recordingDuration.replace("ms", ""));
          durationMs = Number.isFinite(parsed) ? parsed : undefined;
        }
        const remainingMs =
          typeof raw.remainingMs === "number" ? raw.remainingMs : undefined;
        const flightId = raw.flightId ?? raw.currentFlightId ?? null;

        if (!isMounted) return;
        setRecordingStatus((prev) => ({
          active,
          flightId: flightId ?? prev.flightId,
          durationMs: durationMs ?? prev.durationMs,
          remainingMs: remainingMs ?? prev.remainingMs,
        }));
        setRecording(active);
        if (flightId && flightId !== lastFlightId) {
          localStorage.setItem("lastFlightId", flightId);
          setLastFlightId(flightId);
        }
      } catch (e) {
        console.error("Error checking recording status:", e);
      }
    };
    checkStatus();
    const id = setInterval(checkStatus, 1000000);
    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [lastFlightId]);

  const handleStartRecording = async () => {
    try {
      const durationMs = indefiniteRecording
        ? undefined
        : recordingDuration * 1000;
      
      let requestBody: {
        mass: number;
        armLength: number;
        durationMs?: number;
        Kc?: Record<string, number>;
        Ki?: Record<string, number>;
        [key: string]: unknown;
      } = {
        mass,
        armLength,
        ...(durationMs !== undefined && { durationMs })
      };

      // Format the controller parameters based on the controller type
      if (controllerConfig.type === "lqr") {
        // For LQR, we need to send Kc and Ki directly in the root
        requestBody = {
          ...requestBody,
          ...controllerConfig.params, // This will spread Kc and Ki
        };
      } else if (controllerConfig.type === "pid") {
        // Map PID parameters to Kc and Ki structures
        const { roll, pitch, yaw } = controllerConfig.params;
        
        // Helper function to get Kp value based on axis type
        const getKp = (axis: PIDAxis): KP => {
          if (axis.kind === 'cascade') {
            const cascadeAxis = axis as PIDAxisCascade;
            return {
              angle: cascadeAxis.angle?.kp || 0,
              rate: cascadeAxis.rate?.kp || 0
            };
          } else if (axis.kind === 'simple' || axis.kind === 'rate') {
            const simpleAxis = axis as PIDAxisSimple | PIDAxisRate;
            return {
              angle: 0,
              rate: simpleAxis.kp || 0
            };
          }
          return { angle: 0, rate: 0 };
        };
        
        // Helper function to get Ki value based on axis type
        const getKi = (axis: PIDAxis): KI => {
          if (axis.kind === 'cascade') {
            const cascadeAxis = axis as PIDAxisCascade;
            return {
              angle: cascadeAxis.angle?.ki || 0,
              rate: cascadeAxis.rate?.ki || 0
            };
          } else if (axis.kind === 'simple' || axis.kind === 'rate') {
            const simpleAxis = axis as PIDAxisSimple | PIDAxisRate;
            return {
              angle: 0,
              rate: simpleAxis.ki || 0
            };
          }
          return { angle: 0, rate: 0 };
        };
        
        // Get Kp and Ki for each axis
        const rollKp = getKp(roll as PIDAxis);
        const pitchKp = getKp(pitch as PIDAxis);
        const yawKp = getKp(yaw as PIDAxis);
        
        const rollKi = getKi(roll as PIDAxis);
        const pitchKi = getKi(pitch as PIDAxis);
        
        // Build Kc and Ki objects
        const Kc = {
          roll_angle_kp: rollKp.angle,
          roll_rate_kp: rollKp.rate,
          pitch_angle_kp: pitchKp.angle,
          pitch_rate_kp: pitchKp.rate,
          yaw_angle_kp: yawKp.angle,
          yaw_rate_kp: yawKp.rate,
        };
        
        const Ki = {
          roll_angle_ki: rollKi.angle,
          roll_rate_ki: rollKi.rate,
          pitch_angle_ki: pitchKi.angle,
          pitch_rate_ki: pitchKi.rate,
        };
        
        requestBody = {
          ...requestBody,
          Kc,
          Ki,
        };
      } else if (controllerConfig.type === "custom") {
        // For custom controller, you'll need to map the parameters appropriately
        requestBody = {
          ...requestBody,
          ...controllerConfig.params,
        };
        console.warn('Custom controller support may need additional configuration');
      }

      const response = await fetch(`${API_BASE}/recording/start-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.error("Start recording failed:", await response.text());
        return;
      }

      const result = await response.json();
      const flightId = result.flightId ?? null;

      setRecording(true);
      setRecordingStatus({
        active: true,
        remainingMs: durationMs,
        durationMs: durationMs,
        flightId,
      });
      if (flightId) {
        localStorage.setItem("lastFlightId", flightId);
        setLastFlightId(flightId);
      }
    } catch (e) {
      console.error("Error starting recording:", e);
    }
  };

  const handleStopRecording = async () => {
    try {
      setRecording(false);
      const response = await fetch(`${API_BASE}/recording/stop-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        const result = await response.json();
        setRecordingStatus({
          active: false,
          flightId: result?.flightId || lastFlightId,
          remainingMs: 0,
          durationMs: 0,
        });
        if (result?.flightId) {
          localStorage.setItem("lastFlightId", result.flightId);
          setLastFlightId(result.flightId);
          window.dispatchEvent(
            new CustomEvent("recordingStopped", {
              detail: { flightId: result.flightId },
            })
          );
        }
      } else {
        setRecording(true);
      }
    } catch (e) {
      console.error("Error stopping recording:", e);
      setRecording(true);
    }
  };

  const handleRecordingToggle = () =>
    recording ? handleStopRecording() : handleStartRecording();

  const formatTime = (ms?: number) => {
    if (ms == null) return "—";
    const total = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${pad(mm)}:${pad(ss)}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/70 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Grabación</h1>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                recordingStatus.active
                  ? "bg-green-900/40 text-green-300 border border-green-700/50"
                  : "bg-gray-800 text-gray-300 border border-gray-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  recordingStatus.active
                    ? "bg-green-400 animate-pulse"
                    : "bg-gray-400"
                }`}
              />
              {statusLabel}
            </span>
            {recordingStatus.active && (
              <span className="text-sm text-gray-300">
                {formatTime(recordingStatus.remainingMs)} /{" "}
                {formatTime(recordingStatus.durationMs)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={lastFlightId ? "/metrics/last" : "#"}
              onClick={(e) => !lastFlightId && e.preventDefault()}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow transition ${
                lastFlightId
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-700 text-gray-300 cursor-not-allowed"
              }`}
            >
              📊 Métricas último vuelo
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Controles de grabación */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="mb-3 text-lg font-semibold">
              Controles de grabación
            </h2>
            <div className="flex flex-col gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={indefiniteRecording}
                  onChange={(e) => setIndefiniteRecording(e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                <span className="text-sm text-gray-300">
                  Grabación indefinida
                </span>
              </label>
              {!indefiniteRecording && (
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-300 w-48">
                    Duración (segundos)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={3600}
                    value={recordingDuration}
                    onChange={(e) =>
                      setRecordingDuration(Number(e.target.value))
                    }
                    className="w-32 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleRecordingToggle}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow transition ${
                    recording
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-white" />
                  {recording ? "Detener" : "Iniciar grabación"}
                </button>
                <div className="text-sm text-gray-400">
                  {recordingStatus.active ? (
                    <span>
                      {indefiniteRecording ? (
                        "Grabando (indefinido)"
                      ) : (
                        <>
                          Restante: {formatTime(recordingStatus.remainingMs)} /{" "}
                          {formatTime(recordingStatus.durationMs)}
                        </>
                      )}
                    </span>
                  ) : (
                    <span>Listo para grabar</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Modo (SwitchControl) */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="mb-3 text-lg font-semibold">Modo</h2>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <SwitchControl />
            </div>
          </div>
        </section>

        {/* Parámetros y Controlador */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Parámetros de vuelo - Reduced width */}
          <div className="lg:col-span-1 rounded-2xl border border-gray-800 bg-gray-900/40 p-4 text-base">
            <h2 className="mb-3 font-semibold">✈️ Parámetros</h2>
            <div className="space-y-3">
              <Field
                label="Mass (kg)"
                value={mass}
                onChange={(v) => setMass(v)}
              />
              <Field
                label="Arm (m)"
                value={armLength}
                onChange={(v) => setArmLength(v)}
              />
            </div>
          </div>

          {/* Selector + Panel controlador - Increased width */}
          <div className="lg:col-span-4 rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="mb-3 text-lg font-semibold">🧮 Controlador</h2>
            <ControllerSelector
              value={controllerType}
              onChange={setControllerType}
            />
            <div className="mt-4">
              {controllerType === "lqr" && (
                <LQRPanel
                  value={
                    controllerConfig.type === "lqr"
                      ? controllerConfig.params
                      : defaultLQR
                  }
                  onChange={(params: LQRParams) =>
                    setControllerConfig({ type: "lqr", params })
                  }
                />
              )}
              {controllerType === "pid" && (
                <PIDPanel
                  value={
                    controllerConfig.type === "pid"
                      ? controllerConfig.params
                      : defaultPID
                  }
                  onChange={(params: PIDGains) =>
                    setControllerConfig({ type: "pid", params })
                  }
                />
              )}
              {controllerType === "custom" && (
                <CustomPanel
                  value={
                    controllerConfig.type === "custom"
                      ? controllerConfig.params
                      : defaultCustom
                  }
                  onChange={(params: CustomParams) =>
                    setControllerConfig({ type: "custom", params })
                  }
                />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* --- helpers UI --- */
function Field({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 md:w-20 text-xs text-gray-300">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={!!disabled}
        className="w-28 sm:w-32 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs tabular-nums outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
      />
    </div>
  );
}
