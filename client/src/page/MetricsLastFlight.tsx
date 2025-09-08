import { useEffect, useState } from "react";
import KalmanComparePanel from "../components/KalmanComparePanel";

/* ===== Tipos de backend/QuestDB ===== */
interface FlightRecord {
  flight_id: string;
  start_time: string;
  end_time: string | null;
  mass: number | null;
  duration_seconds?: number;
  flight_time_seconds?: number;
  status: "recording" | "completed" | "error";
  message?: string;
}

// Respuesta /recording/recent-flights (array plano)
type FlightsApiRow = {
  flight_id: string;
  start_time: string;
  end_time: string | null;
  mass: number | null;
};

/* ===== Tipos del JSON de metrics.py ===== */
type Osc = { half_cycles: number; cycles: number; dominant_freq_hz: number };
type KalEff = {
  variance_ratio: number;
  hf_noise_reduction_db: number;
  snr_improvement_db: number;
  delay_s: number;
};
type AxisSignal = {
  raw: { std: number; rms: number; peak_deg: number };
  kalman: { std: number; rms: number; peak_deg: number };
  dominant_freq_hz: number;
};
type AxisError = {
  rmse_deg: number;
  mae_deg: number;
  iae_deg_s: number;
  ise_deg2_s: number;
  itae_deg_s2: number;
  itse_deg2_s2: number;
  max_abs_error_deg: number;
};
type AxisControl = {
  tau_rms: number;
  tau_energy: number;
  tau_avg_abs: number;
  jerk_rms: number;
};
type AxisMetrics = {
  name: "roll" | "pitch";
  duration_s: number;
  fs_hz: number;
  signal: AxisSignal;
  kalman_effectiveness: KalEff;
  response: {
    // p.ej. settling_from_24d_to_pm5d_s puede venir null si no hubo excursión ≥ 24°
    [k: string]: number | Osc | null;
    oscillations: Osc;
  };
  error: AxisError;
  control: AxisControl;
  stabilization_score: number;
};
type Combined = {
  stabilization_score: number;
  kalman_effectiveness_avg: KalEff;
};
type PyMetricsPayload = {
  ok: boolean;
  inputs?: {
    duration_s: number;
    fs_hz_est: number;
    columns_present: string[];
    num_samples: number;
  };
  metrics: {
    // legacy (si quieres seguir mostrando algo viejo)
    rmse_roll?: number;
    rmse_pitch?: number;
    overshoot_roll_pct?: number;
    overshoot_pitch_pct?: number;
    settling_time_roll_s?: number;
    settling_time_pitch_s?: number;
    // nuevos
    roll: AxisMetrics;
    pitch: AxisMetrics;
    combined: Combined;
  };
  mode: "batch" | "live";
};

interface BatchMetadata {
  flightId: string;
  csvPath: string;
  processedAt: string;
}
type BatchResponse = PyMetricsPayload & { metadata?: BatchMetadata };

/* ===== Helpers UI ===== */
function pick<T extends object, K extends string, R = unknown>(
  obj: T,
  path: K
): R | undefined {
  return path.split(".").reduce<unknown>((o, k) => {
    if (o && typeof o === "object" && k in o) {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj) as R | undefined;
}
function fmt(v?: number | null, digits = 3) {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return Number(v).toFixed(digits);
}
function parseQuestDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? Math.floor(v / 1000) : v;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

interface MetricProps {
  label: string;
  value: string | number | null | undefined;
  suffix?: string;
  note?: string;
}
function Metric({ label, value, suffix = "", note }: MetricProps) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="bg-gray-900 p-3 rounded">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-2xl font-bold">
        {missing ? "—" : value}
        {!missing && suffix}
      </div>
      {note && <div className="text-xs text-gray-400 mt-1">{note}</div>}
    </div>
  );
}

/* ===== Componente principal ===== */
export default function MetricsLastFlight() {
  const [currentFlightId, setCurrentFlightId] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<{
    isRecording: boolean;
    flightId?: string;
    lastFlightId?: string;
  }>({ isRecording: false });

  const [recentFlights, setRecentFlights] = useState<FlightRecord[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<FlightRecord | null>(
    null
  );

  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const cols = batch?.inputs?.columns_present ?? [];
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar estado y vuelos recientes
  useEffect(() => {
    const loadFlightStatus = async () => {
      try {
        const [statusRes, flightsRes] = await Promise.all([
          fetch("http://localhost:3002/recording/recording-status"),
          fetch("http://localhost:3002/recording/recent-flights"),
        ]);

        if (statusRes.ok) {
          const status = await statusRes.json();
          setRecordingStatus({
            isRecording: Boolean(status.isRecording ?? status.active),
            flightId: status.flightId,
            lastFlightId: status.lastFlightId, // puede venir undefined (no pasa nada)
          });

          const fid =
            status.flightId ||
            status.lastFlightId ||
            localStorage.getItem("lastFlightId");
          if (fid) {
            setCurrentFlightId(fid);
            setError(null);
          } else {
            setError("No hay flightId reciente. Graba un vuelo primero.");
          }
        }

        if (flightsRes.ok) {
          const flightsRaw: FlightsApiRow[] = await flightsRes.json();
          const flightsWithDuration: FlightRecord[] = flightsRaw.map((f) => {
            const start = parseQuestDate(f.start_time)?.getTime() ?? Date.now();
            const end = f.end_time
              ? parseQuestDate(f.end_time)?.getTime() ?? start
              : Date.now();
            const raw = (end - start) / 1000;
            const safeStatus = f.end_time
              ? "completed"
              : raw > 7200
              ? "completed"
              : "recording";
            return {
              ...f,
              duration_seconds: Math.max(0, raw),
              status: safeStatus,
            };
          });

          setRecentFlights(flightsWithDuration);
          if (!selectedFlight && flightsWithDuration.length > 0) {
            setSelectedFlight(flightsWithDuration[0]);
          }
        }
      } catch (e) {
        console.error("Error loading flight data:", e);
        const fid = localStorage.getItem("lastFlightId");
        if (fid) {
          setCurrentFlightId(fid);
        } else {
          setError("Error al cargar los vuelos. Intenta recargar la página.");
        }
      }
    };

    loadFlightStatus();
    const interval = setInterval(loadFlightStatus, 5000);
    return () => clearInterval(interval);
  }, [selectedFlight]);

  // Cálculo del tiempo de vuelo cuando cambia el vuelo seleccionado (usa tu endpoint real)
  useEffect(() => {
    if (!selectedFlight?.flight_id) return;

    (async () => {
      try {
        const response = await fetch(
          `http://localhost:3002/flight-metrics/${selectedFlight.flight_id}`
        );
        if (!response.ok) throw new Error("Failed to fetch flight metrics");
        const data = await response.json();
        const flightTime = data.flight_time_seconds || 0;

        setSelectedFlight((prev) =>
          prev ? { ...prev, flight_time_seconds: flightTime } : prev
        );
      } catch (e) {
        console.error("Error calculating flight time:", e);
      }
    })();
  }, [selectedFlight?.flight_id]);

  // Ejecutar análisis batch (usa tu endpoint real /metrics/batch)
  const runBatch = async () => {
    setLoadingBatch(true);
    setError(null);
    try {
      const latestCompleted = recentFlights.find(
        (f) => f.status === "completed"
      );
      const fid =
        latestCompleted?.flight_id ??
        recordingStatus.lastFlightId ??
        currentFlightId ??
        localStorage.getItem("lastFlightId");

      if (!fid) throw new Error("No hay un vuelo completado para analizar.");

      const r = await fetch("http://localhost:3002/metrics/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightId: fid }),
      });
      if (!r.ok) throw new Error(await r.text());
      const batchData: BatchResponse = await r.json();
      setBatch(batchData);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Error calculando métricas batch";
      setError(msg);
    } finally {
      setLoadingBatch(false);
    }
  };

  return (
    <div className="p-6 text-white max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">📊 Análisis de Vuelos</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Detalles del vuelo seleccionado */}
      {selectedFlight && (
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-3">Detalles del Vuelo</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">ID de Vuelo</p>
              <p className="font-mono text-sm break-all">
                {selectedFlight.flight_id}
              </p>
            </div>

            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">Hora de Inicio</p>
              {(() => {
                const d = parseQuestDate(selectedFlight.start_time);
                return (
                  <p>
                    {d
                      ? d.toLocaleString("es-MX", {
                          timeZone: "America/Mexico_City",
                        })
                      : "—"}
                  </p>
                );
              })()}
            </div>

            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">Duración Total</p>
              <p>
                {selectedFlight.duration_seconds
                  ? `${selectedFlight.duration_seconds.toFixed(1)} seg`
                  : "Calculando..."}
              </p>
            </div>

            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">
                Tiempo de Vuelo (throttle 1300-2000)
              </p>
              <p>
                {selectedFlight.flight_time_seconds !== undefined
                  ? `${selectedFlight.flight_time_seconds.toFixed(1)} seg`
                  : "Calculando..."}
              </p>
            </div>

            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">Masa</p>
              <p>
                {selectedFlight.mass
                  ? `${selectedFlight.mass} kg`
                  : "No especificada"}
              </p>
            </div>

            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">Estado</p>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  selectedFlight.status === "recording"
                    ? "bg-blue-100 text-blue-800"
                    : selectedFlight.status === "completed"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {selectedFlight.status === "recording"
                  ? "Grabando"
                  : selectedFlight.status === "completed"
                  ? "Completado"
                  : "Error"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Procesamiento batch */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Procesamiento de Vuelo</h2>
          <button
            onClick={runBatch}
            disabled={loadingBatch || !selectedFlight}
            className={`px-4 py-2 rounded ${
              loadingBatch || !selectedFlight
                ? "bg-gray-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loadingBatch ? "Calculando…" : "Calcular métricas completas"}
          </button>
        </div>

        {batch?.metrics && (
          <div className="space-y-6 mt-4">
            {/* RESUMEN / COMBINADO */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Resumen</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Metric
                  label="Score de Estabilización (avg)"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "combined.stabilization_score"
                    ) as number
                  )}
                  suffix="/100"
                />
                <Metric
                  label="Mejora SNR Kalman (avg)"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "combined.kalman_effectiveness_avg.snr_improvement_db"
                    ) as number
                  )}
                  suffix=" dB"
                />
                <Metric
                  label="Reducción HF Kalman (avg)"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "combined.kalman_effectiveness_avg.hf_noise_reduction_db"
                    ) as number
                  )}
                  suffix=" dB"
                />
                <Metric
                  label="Duración (inputs)"
                  value={batch?.inputs?.duration_s}
                  suffix=" s"
                />
                <Metric
                  label="fs estimada"
                  value={batch?.inputs?.fs_hz_est}
                  suffix=" Hz"
                />
              </div>
            </div>

            {/* ROLL */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Eje Roll</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Kalman effectiveness */}
                <Metric
                  label="Varianza raw/kal"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "roll.kalman_effectiveness.variance_ratio"
                    ) as number
                  )}
                />
                <Metric
                  label="Mejora SNR Kalman"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "roll.kalman_effectiveness.snr_improvement_db"
                    ) as number
                  )}
                  suffix=" dB"
                />
                <Metric
                  label="Reducción HF Kalman"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "roll.kalman_effectiveness.hf_noise_reduction_db"
                    ) as number
                  )}
                  suffix=" dB"
                />
                <Metric
                  label="Retardo Kalman"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "roll.kalman_effectiveness.delay_s"
                    ) as number
                  )}
                  suffix=" s"
                />

                {/* Respuesta / asentamiento / oscilaciones */}
                <Metric
                  label="Asentamiento (24° → ±5°)"
                  value={
                    pick(
                      batch.metrics,
                      "roll.response.settling_from_24d_to_pm5d_s"
                    ) == null
                      ? null
                      : fmt(
                          pick(
                            batch.metrics,
                            "roll.response.settling_from_24d_to_pm5d_s"
                          ) as number
                        )
                  }
                  suffix=" s"
                  note={
                    pick(
                      batch.metrics,
                      "roll.response.settling_from_24d_to_pm5d_s"
                    ) == null
                      ? "sin excursión ≥ 24° en este vuelo"
                      : undefined
                  }
                />
                <Metric
                  label="Oscilaciones (ciclos)"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "roll.response.oscillations.cycles"
                    ) as number
                  )}
                />
                <Metric
                  label="Frecuencia dominante"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "roll.signal.dominant_freq_hz"
                    ) as number
                  )}
                  suffix=" Hz"
                />

                {/* Error clásico */}
                <Metric
                  label="RMSE error (φ)"
                  value={fmt(
                    pick(batch.metrics, "roll.error.rmse_deg") as number
                  )}
                  suffix=" °"
                />
                <Metric
                  label="MAE error (φ)"
                  value={fmt(
                    pick(batch.metrics, "roll.error.mae_deg") as number
                  )}
                  suffix=" °"
                />
                <Metric
                  label="IAE"
                  value={fmt(
                    pick(batch.metrics, "roll.error.iae_deg_s") as number
                  )}
                  suffix=" °·s"
                />
                <Metric
                  label="ISE"
                  value={fmt(
                    pick(batch.metrics, "roll.error.ise_deg2_s") as number
                  )}
                  suffix=" °²·s"
                />
                <Metric
                  label="ITAE"
                  value={fmt(
                    pick(batch.metrics, "roll.error.itae_deg_s2") as number
                  )}
                  suffix=" °·s²"
                />
                <Metric
                  label="ITSE"
                  value={fmt(
                    pick(batch.metrics, "roll.error.itse_deg2_s2") as number
                  )}
                  suffix=" °²·s²"
                />
                <Metric
                  label="|e| máx"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "roll.error.max_abs_error_deg"
                    ) as number
                  )}
                  suffix=" °"
                />

                {/* Esfuerzo de control */}
                <Metric
                  label="τ RMS (τx)"
                  value={fmt(
                    pick(batch.metrics, "roll.control.tau_rms") as number
                  )}
                  note={
                    !cols.includes("tau_x")
                      ? "columna 'tau_x' no presente"
                      : undefined
                  }
                />
                <Metric
                  label="Energía ∫τ²dt"
                  value={fmt(
                    pick(batch.metrics, "roll.control.tau_energy") as number
                  )}
                  note={
                    !cols.includes("tau_x")
                      ? "columna 'tau_x' no presente"
                      : undefined
                  }
                />
                <Metric
                  label="|τ| prom"
                  value={fmt(
                    pick(batch.metrics, "roll.control.tau_avg_abs") as number
                  )}
                  note={
                    !cols.includes("tau_x")
                      ? "columna 'tau_x' no presente"
                      : undefined
                  }
                />
                <Metric
                  label="Jerk(τ) RMS"
                  value={fmt(
                    pick(batch.metrics, "roll.control.jerk_rms") as number
                  )}
                  note={
                    !cols.includes("tau_x")
                      ? "columna 'tau_x' no presente"
                      : undefined
                  }
                />

                {/* Score */}
                <Metric
                  label="Score Roll"
                  value={fmt(
                    pick(batch.metrics, "roll.stabilization_score") as number
                  )}
                  suffix="/100"
                />
              </div>
            </div>

            {/* PITCH */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Eje Pitch</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Metric
                  label="Varianza raw/kal"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "pitch.kalman_effectiveness.variance_ratio"
                    ) as number
                  )}
                />
                <Metric
                  label="Mejora SNR Kalman"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "pitch.kalman_effectiveness.snr_improvement_db"
                    ) as number
                  )}
                  suffix=" dB"
                />
                <Metric
                  label="Reducción HF Kalman"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "pitch.kalman_effectiveness.hf_noise_reduction_db"
                    ) as number
                  )}
                  suffix=" dB"
                />
                <Metric
                  label="Retardo Kalman"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "pitch.kalman_effectiveness.delay_s"
                    ) as number
                  )}
                  suffix=" s"
                />

                <Metric
                  label="Asentamiento (24° → ±5°)"
                  value={
                    pick(
                      batch.metrics,
                      "pitch.response.settling_from_24d_to_pm5d_s"
                    ) == null
                      ? null
                      : fmt(
                          pick(
                            batch.metrics,
                            "pitch.response.settling_from_24d_to_pm5d_s"
                          ) as number
                        )
                  }
                  suffix=" s"
                  note={
                    pick(
                      batch.metrics,
                      "pitch.response.settling_from_24d_to_pm5d_s"
                    ) == null
                      ? "sin excursión ≥ 24° en este vuelo"
                      : undefined
                  }
                />
                <Metric
                  label="Oscilaciones (ciclos)"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "pitch.response.oscillations.cycles"
                    ) as number
                  )}
                />
                <Metric
                  label="Frecuencia dominante"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "pitch.signal.dominant_freq_hz"
                    ) as number
                  )}
                  suffix=" Hz"
                />

                <Metric
                  label="RMSE error (θ)"
                  value={fmt(
                    pick(batch.metrics, "pitch.error.rmse_deg") as number
                  )}
                  suffix=" °"
                />
                <Metric
                  label="MAE error (θ)"
                  value={fmt(
                    pick(batch.metrics, "pitch.error.mae_deg") as number
                  )}
                  suffix=" °"
                />
                <Metric
                  label="IAE"
                  value={fmt(
                    pick(batch.metrics, "pitch.error.iae_deg_s") as number
                  )}
                  suffix=" °·s"
                />
                <Metric
                  label="ISE"
                  value={fmt(
                    pick(batch.metrics, "pitch.error.ise_deg2_s") as number
                  )}
                  suffix=" °²·s"
                />
                <Metric
                  label="ITAE"
                  value={fmt(
                    pick(batch.metrics, "pitch.error.itae_deg_s2") as number
                  )}
                  suffix=" °·s²"
                />
                <Metric
                  label="ITSE"
                  value={fmt(
                    pick(batch.metrics, "pitch.error.itse_deg2_s2") as number
                  )}
                  suffix=" °²·s²"
                />
                <Metric
                  label="|e| máx"
                  value={fmt(
                    pick(
                      batch.metrics,
                      "pitch.error.max_abs_error_deg"
                    ) as number
                  )}
                  suffix=" °"
                />

                <Metric
                  label="τ RMS (τy)"
                  value={fmt(
                    pick(batch.metrics, "pitch.control.tau_rms") as number
                  )}
                  note={
                    !cols.includes("tau_y")
                      ? "columna 'tau_y' no presente"
                      : undefined
                  }
                />
                <Metric
                  label="Energía ∫τ²dt"
                  value={fmt(
                    pick(batch.metrics, "pitch.control.tau_energy") as number
                  )}
                  note={
                    !cols.includes("tau_y")
                      ? "columna 'tau_y' no presente"
                      : undefined
                  }
                />
                <Metric
                  label="|τ| prom"
                  value={fmt(
                    pick(batch.metrics, "pitch.control.tau_avg_abs") as number
                  )}
                  note={
                    !cols.includes("tau_y")
                      ? "columna 'tau_y' no presente"
                      : undefined
                  }
                />
                <Metric
                  label="Jerk(τ) RMS"
                  value={fmt(
                    pick(batch.metrics, "pitch.control.jerk_rms") as number
                  )}
                  note={
                    !cols.includes("tau_y")
                      ? "columna 'tau_y' no presente"
                      : undefined
                  }
                />

                <Metric
                  label="Score Pitch"
                  value={fmt(
                    pick(batch.metrics, "pitch.stabilization_score") as number
                  )}
                  suffix="/100"
                />
              </div>
              {selectedFlight && (
                <KalmanComparePanel
                  flightId={selectedFlight.flight_id}
                  className="mt-4"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lista de vuelos */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">Lista de Vuelos</h2>
        {recentFlights.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">
                    ID de Vuelo
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">
                    Inicio
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">
                    Duración
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">
                    Tiempo de Vuelo
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {recentFlights.map((flight, idx) => (
                  <tr
                    key={flight.flight_id ?? `row-${idx}`}
                    className={`hover:bg-gray-700 cursor-pointer ${
                      selectedFlight?.flight_id === flight.flight_id
                        ? "bg-gray-700"
                        : ""
                    }`}
                    onClick={() => setSelectedFlight(flight)}
                  >
                    <td className="px-4 py-2 text-sm font-mono">
                      {flight.flight_id}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {(() => {
                        const d = parseQuestDate(flight.start_time);
                        return d
                          ? d.toLocaleTimeString("es-MX", {
                              timeZone: "America/Mexico_City",
                            })
                          : "—";
                      })()}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {flight.duration_seconds
                        ? `${flight.duration_seconds.toFixed(1)}s`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {flight.flight_time_seconds
                        ? `${flight.flight_time_seconds.toFixed(1)}s`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          flight.status === "recording"
                            ? "bg-blue-100 text-blue-800"
                            : flight.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {flight.status === "recording"
                          ? "Grabando"
                          : flight.status === "completed"
                          ? "Completado"
                          : "Error"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400">No hay vuelos recientes</p>
        )}
      </div>

      <div className="flex justify-between">
        <a
          href="/"
          className="inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
        >
          ← Volver al Inicio
        </a>
        {currentFlightId && (
          <button
            onClick={runBatch}
            disabled={loadingBatch}
            className={`px-4 py-2 rounded ${
              loadingBatch ? "bg-gray-600" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loadingBatch ? "Analizando..." : "Analizar Vuelo Actual"}
          </button>
        )}
      </div>
    </div>
  );
}
