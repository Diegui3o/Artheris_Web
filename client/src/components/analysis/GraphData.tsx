// Helper function to format numbers
function fmt(n: number | string | null | undefined, d = 2): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(d);
}

type AnalysisFile = { name: string; url: string };
type AnalysisResult = { ok: boolean; status: string; files: AnalysisFile[] };
type ServerStatus = "pending" | "running" | "completed" | "error" | "cancelled";
type JobStatus = "idle" | "running" | "done" | "error";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

// Custom JSON parse function that handles NaN values
const parseJsonWithNaN = (jsonString: string) => {
  const sanitized = sanitizeJsonNumbers(jsonString);
  return JSON.parse(sanitized, (_, value) => {
    if (value === "NaN" || value === "Infinity" || value === "-Infinity") {
      return null;
    }
    if (typeof value === "string" && /^nan$/i.test(value)) return null;
    if (typeof value === "number" && Number.isNaN(value)) return null;
    return value;
  });
};

import {
  TrackingAxisCanvas,
  TauMotorsCanvas,
  CorrelationsCanvas,
} from "./PlotFlight";
import {
  PlotCard,
  StepTable,
  BodeMagCanvas,
  BodePhaseCanvas,
} from "./PlotPanel";

type ProEvent = {
  t: number;
  idx: number;
  amp_deg: number;
  channel?: "roll" | "pitch" | string;
};

type ProStep = {
  channel: "roll" | "pitch" | string;
  rise_time_s?: number | null;
  ts_2pct_s?: number | null;
  overshoot_pct?: number | null;
};

type ProFRF = {
  ref_to_est?: {
    freq_hz: number[];
    mag?: number[];
    mag_db?: number[];
    phase_deg?: number[];
    phase?: number[];
  };
};

type ProLatency = {
  roll_ref_to_est_ms?: number | null;
  pitch_ref_to_est_ms?: number | null;
};
function sanitizeJsonNumbers(raw: string): string {
  let out = "";
  let inStr = false;
  let esc = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inStr) {
      out += ch;
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }

    if (raw.startsWith("-Infinity", i)) {
      // borde anterior no alfanumérico
      const beforeOk = i === 0 || /[^A-Za-z0-9_$]/.test(raw[i - 1]);
      const afterOk = i + 9 >= raw.length || /[^A-Za-z0-9_$]/.test(raw[i + 9]);
      if (beforeOk && afterOk) {
        out += "null";
        i += 8; // consumimos "-Infinity"
        continue;
      }
    }
    if (raw.startsWith("Infinity", i)) {
      const beforeOk = i === 0 || /[^A-Za-z0-9_$]/.test(raw[i - 1]);
      const afterOk = i + 8 >= raw.length || /[^A-Za-z0-9_$]/.test(raw[i + 8]);
      if (beforeOk && afterOk) {
        out += "null";
        i += 7; // consumimos "Infinity"
        continue;
      }
    }
    if (
      raw.startsWith("NaN", i) ||
      raw.startsWith("nan", i) ||
      raw.startsWith("NAN", i)
    ) {
      const len = 3;
      const beforeOk = i === 0 || /[^A-Za-z0-9_$]/.test(raw[i - 1]);
      const afterOk =
        i + len >= raw.length || /[^A-Za-z0-9_$]/.test(raw[i + len]);
      if (beforeOk && afterOk) {
        out += "null";
        i += len - 1;
        continue;
      }
    }

    out += ch;
  }
  return out;
}

const API_BASE =
  import.meta.env.VITE_API_BASE?.toString() || "http://localhost:3002";
export interface AnalysisPanelProps {
  flightId?: string | null;
  fallbackToLast?: boolean;
  autoRun?: boolean;
  allowRetry?: boolean;
}

type PlotPSD = { freq_hz: number[]; power: number[] };

type PlotData = {
  meta: { fs_hz: number; n: number; columns: string[] };
  time_s: number[];
  roll: { raw: number[]; est: number[]; ref?: number[] | null };
  pitch: { raw: number[]; est: number[]; ref?: number[] | null };
  errors: {
    phi?: number[] | null;
    theta?: number[] | null;
    roll?: number[] | null;
    pitch?: number[] | null;
  };
  control: {
    tau_x?: number[] | null;
    tau_y?: number[] | null;
    tau_z?: number[] | null;
    tau_mag?: number[] | null;
    motors?: {
      avg?: number[];
      diff_13?: number[];
      diff_24?: number[];
    };
  };
  quick_corr?: {
    abs_err_roll_vs_tau?: number[];
    abs_err_pitch_vs_tau?: number[];
    tau_vs_motor_diff_13?: number[];
    tau_vs_motor_diff_24?: number[];
  };
  psd: {
    roll_raw: PlotPSD;
    roll_est: PlotPSD;
    pitch_raw: PlotPSD;
    pitch_est: PlotPSD;
  };
  pro?: {
    events?: ProEvent[];
    step_responses?: ProStep[];
    frf?: ProFRF; // roll
    frf_pitch?: ProFRF; // ✅ pitch
    latency?: ProLatency;
  };
};

function normalizeStatus(s?: string): JobStatus {
  switch (s as ServerStatus) {
    case "running":
      return "running";
    case "completed":
      return "done";
    case "error":
      return "error";
    case "cancelled":
      return "error";
    case "pending":
      return "running"; // si quieres mostrar spinner
    default:
      return "idle";
  }
}

export default function AnalysisPanel({
  flightId,
  fallbackToLast = true,
  autoRun = true,
  allowRetry = true,
}: AnalysisPanelProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [files, setFiles] = useState<AnalysisFile[]>([]);
  interface MetricsData {
    metrics?: {
      combined?: {
        stabilization_score?: number;
        kalman_effectiveness_avg?: { snr_improvement_db?: number };
      };
      roll?: { fs_hz?: number; duration_s?: number };
      pitch?: { fs_hz?: number; duration_s?: number };
    };
    inputs?: { fs_hz_est?: number; duration_s?: number };
  }
  const [metricsJson, setMetricsJson] = useState<MetricsData | null>(null);
  const [plotData, setPlotData] = useState<PlotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const effectiveFlightId = useMemo(() => {
    if (flightId) return flightId;
    if (!fallbackToLast) return null;
    return localStorage.getItem("lastFlightId");
  }, [flightId, fallbackToLast]);

  const loadResults = useCallback(async (jid: string) => {
    try {
      const res = await fetch(`${API_BASE}/analysis/results/${jid}`);
      if (!res.ok) throw new Error(await res.text());
      const data: AnalysisResult = await res.json();

      const absolutize = (u: string) =>
        u?.startsWith("http") ? u : `${API_BASE}${u}`;
      const fs = (data.files || []).map((f) => ({
        ...f,
        url: absolutize(f.url),
      }));
      setFiles(fs);

      // 1) localizar archivos
      const metricsFile = fs.find((f) =>
        f.name.endsWith("flight_metrics.json")
      );
      const plotDataFile = fs.find((f) => f.name.endsWith("plot_data.json"));

      // 2) cargar métricas (como ya hacías)
      if (metricsFile) {
        try {
          const r = await fetch(metricsFile.url);
          if (r.ok) setMetricsJson(await r.json());
        } catch (e) {
          console.error("Error loading metrics:", e);
        }
      }

      // 3) cargar plot_data con fallback robusto
      let plotJsonOk = false;

      // a) si viene en la lista
      if (plotDataFile) {
        try {
          const response = await fetch(plotDataFile.url, {
            headers: { Accept: "application/json" },
          });
          if (response.ok) {
            // Clonar la respuesta para poder leerla dos veces si es necesario
            const responseClone = response.clone();
            try {
              setPlotData(parseJsonWithNaN(await response.text()));
              plotJsonOk = true;
            } catch {
              // fallback por si el servidor no marca application/json
              try {
                setPlotData(parseJsonWithNaN(await responseClone.text()));
                plotJsonOk = true;
              } catch (parseError) {
                console.error("Error parsing plot_data as text:", parseError);
              }
            }
          }
        } catch (e) {
          console.error("Error loading plot_data from files list:", e);
        }
      }

      // b) fallback por ruta directa (por si la lista no trajo el archivo con URL correcta)
      if (!plotJsonOk) {
        const direct = `${API_BASE}/analysis/assets/${jid}/plot_data.json`;
        try {
          const response = await fetch(direct, {
            headers: { Accept: "application/json" },
          });
          if (response.ok) {
            // Clonar la respuesta para poder leerla dos veces si es necesario
            const responseClone = response.clone();
            try {
              setPlotData(parseJsonWithNaN(await response.text()));
              plotJsonOk = true;
            } catch {
              try {
                setPlotData(parseJsonWithNaN(await responseClone.text()));
                plotJsonOk = true;
              } catch (parseError) {
                console.error(
                  "Error parsing fallback plot_data as text:",
                  parseError
                );
              }
            }
          }
        } catch (e) {
          console.error("Fallback direct load of plot_data.json failed:", e);
        }
      }

      if (!plotJsonOk) {
        console.warn("plot_data.json no pudo parsearse; revisa el backend.");
      }
    } catch (error) {
      console.error("Error loading analysis results:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load analysis results"
      );
    }
  }, []);

  const pollStatus = useCallback(
    (jid: string) => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      const tick = async () => {
        try {
          const res = await fetch(`${API_BASE}/analysis/status/${jid}`);
          if (!res.ok) throw new Error(await res.text());
          const { job } = await res.json();
          const st = normalizeStatus(job?.status);
          if (st === "done") {
            setStatus("done");
            if (pollRef.current) window.clearInterval(pollRef.current);
            await loadResults(jid);
          } else if (st === "error") {
            setStatus("error");
            if (pollRef.current) window.clearInterval(pollRef.current);
          } else {
            setStatus("running");
          }
        } catch (e: unknown) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Fallo consultando estado");
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      };
      tick();
      pollRef.current = window.setInterval(tick, 1200);
    },
    [loadResults]
  );

  const startAnalysis = useCallback(
    async (fId: string) => {
      try {
        setError(null);
        setStatus("running");
        setFiles([]);
        setMetricsJson(null);
        setPlotData(null);

        const res = await fetch(`${API_BASE}/analysis/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flightId: fId, debug: false, pro: true }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const jid = data.jobId as string;
        setJobId(jid);
        pollStatus(jid);
      } catch (e: unknown) {
        setStatus("error");
        setError(
          e instanceof Error ? e.message : "No se pudo iniciar el análisis"
        );
      }
    },
    [pollStatus]
  );
  useEffect(() => {
    if (!autoRun) return;
    if (!effectiveFlightId) return;
    startAnalysis(effectiveFlightId);
  }, [autoRun, effectiveFlightId, startAnalysis]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);
  const csvLink = useMemo(
    () => files.find((f) => f.name.toLowerCase().endsWith(".csv")),
    [files]
  );

  const plotJsonLink = useMemo(
    // NEW
    () => files.find((f) => f.name.endsWith("plot_data.json")),
    [files]
  );

  const metricsQuick = useMemo(() => {
    const c = metricsJson?.metrics?.combined;
    const roll = metricsJson?.metrics?.roll;
    const pitch = metricsJson?.metrics?.pitch;
    return {
      stabScore: c?.stabilization_score,
      fsHz: metricsJson?.inputs?.fs_hz_est ?? roll?.fs_hz ?? pitch?.fs_hz,
      durS:
        metricsJson?.inputs?.duration_s ??
        roll?.duration_s ??
        pitch?.duration_s,
      kalmanAvgDb: c?.kalman_effectiveness_avg?.snr_improvement_db,
    };
  }, [metricsJson]);

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📈 Análisis del vuelo</h2>
          <p className="text-sm text-gray-400">
            {effectiveFlightId ? (
              <>
                Flight ID:{" "}
                <code className="text-gray-300">{effectiveFlightId}</code>
              </>
            ) : (
              <>Selecciona un vuelo o graba uno nuevo.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              effectiveFlightId && startAnalysis(effectiveFlightId)
            }
            disabled={!effectiveFlightId || status === "running"}
            className={`rounded-lg px-4 py-2 text-sm font-semibold shadow transition
            ${
              status === "running"
                ? "bg-gray-700 cursor-wait"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {status === "running" ? "Procesando…" : "Generar análisis"}
          </button>
          {allowRetry && status === "error" && (
            <button
              onClick={() =>
                effectiveFlightId && startAnalysis(effectiveFlightId)
              }
              className="rounded-lg px-3 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
      {/* Estado / errores */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800/60 bg-red-950/40 p-3 text-sm text-red-300">
          {String(error)}
        </div>
      )}
      {/* Resumen rápido de métricas */}
      {metricsJson && (
        <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Score Estabilización"
            value={fmt(metricsQuick.stabScore, 1)}
            suffix="/100"
          />
          <Stat
            label="fs estimada"
            value={fmt(metricsQuick.fsHz, 2)}
            suffix="Hz"
          />
          <Stat label="Duración" value={fmt(metricsQuick.durS, 2)} suffix="s" />
          <Stat
            label="Mejora SNR (avg)"
            value={fmt(metricsQuick.kalmanAvgDb, 2)}
            suffix="dB"
          />
        </div>
      )}
      {/* Enlaces útiles */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {csvLink && (
          <a
            href={csvLink.url}
            target="_blank"
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700"
          >
            Descargar CSV
          </a>
        )}
        {files.find((f) => f.name.endsWith("flight_metrics.json")) && (
          <a
            href={
              files.find((f) => f.name.endsWith("flight_metrics.json"))!.url
            }
            target="_blank"
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700"
          >
            Ver JSON de métricas
          </a>
        )}
        {plotJsonLink && ( // NEW
          <a
            href={plotJsonLink.url}
            target="_blank"
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700"
          >
            Ver plot_data.json
          </a>
        )}
        {files.find((f) => f.name === "roll_points.csv") && (
          <a
            href={files.find((f) => f.name === "roll_points.csv")!.url}
            target="_blank"
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700"
          >
            roll_points.csv
          </a>
        )}
        {files.find((f) => f.name === "pitch_points.csv") && (
          <a
            href={files.find((f) => f.name === "pitch_points.csv")!.url}
            target="_blank"
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700"
          >
            pitch_points.csv
          </a>
        )}
        {jobId && (
          <a
            href={`${API_BASE}/analysis/status/${jobId}`}
            target="_blank"
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700"
          >
            Status API
          </a>
        )}
      </div>
      {/* Latencias PRO si están disponibles */}
      {plotData?.pro?.latency && (
        <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Latencia roll (ref→est)"
            value={fmt(plotData.pro.latency.roll_ref_to_est_ms, 1)}
            suffix=" ms"
          />
          <Stat
            label="Latencia pitch (ref→est)"
            value={fmt(plotData.pro.latency.pitch_ref_to_est_ms, 1)}
            suffix=" ms"
          />
        </div>
      )}
      {/* Tabla de respuesta a escalón */}
      {plotData?.pro?.step_responses &&
      plotData.pro.step_responses.length > 0 ? (
        <PlotCard title="Respuesta a escalón (detectada)">
          <StepTable steps={plotData.pro.step_responses} />
        </PlotCard>
      ) : plotData?.pro ? (
        <div className="text-sm text-gray-400 mb-4">
          No se detectaron escalones en la referencia.
        </div>
      ) : null}
      {/* Bode (FRF ref→est) ROLL */}
      {plotData?.pro?.frf?.ref_to_est &&
        ((plotData.pro.frf.ref_to_est.freq_hz?.length ?? 0) > 3 ? (
          <div className="grid md:grid-cols-2 gap-6">
            <PlotCard title="Bode Roll (|H|) ref→est">
              <BodeMagCanvas fr={plotData.pro.frf.ref_to_est} />
            </PlotCard>
            <PlotCard title="Bode Roll (∠H) ref→est">
              <BodePhaseCanvas fr={plotData.pro.frf.ref_to_est} />
            </PlotCard>
          </div>
        ) : null)}

      {plotData?.pro?.frf_pitch?.ref_to_est &&
        ((plotData.pro.frf_pitch.ref_to_est.freq_hz?.length ?? 0) > 3 ? (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <PlotCard title="Bode Pitch (|H|) ref→est">
              <BodeMagCanvas fr={plotData.pro.frf_pitch.ref_to_est} />
            </PlotCard>
            <PlotCard title="Bode Pitch (∠H) ref→est">
              <BodePhaseCanvas fr={plotData.pro.frf_pitch.ref_to_est} />
            </PlotCard>
          </div>
        ) : null)}

      {/* NUEVO: Gráficas interactivas (puntos + línea) */}
      {plotData ? (
        <div className="mb-6 space-y-6">
          <PlotCard title="Roll — seguimiento (est vs ref)">
            <TrackingAxisCanvas
              time={plotData?.time_s ?? []}
              est={plotData?.roll?.est ?? []}
              raw={plotData?.roll?.raw ?? []}
              refSeries={
                plotData?.roll?.ref ??
                Array((plotData?.time_s ?? []).length).fill(0)
              }
              yLabel="Ángulo (deg)"
              markers={(plotData.pro?.events || [])
                .filter(
                  (ev: ProEvent) =>
                    ev.channel === "roll" && Number.isFinite(ev.t)
                )
                .map((ev: ProEvent) => ev.t)}
              titleRight="est (verde) · ref (ámbar)"
            />
          </PlotCard>
          <PlotCard title="Esfuerzo y motores">
            <TauMotorsCanvas
              time={plotData.time_s}
              tauX={plotData.control.tau_x ?? undefined}
              tauY={plotData.control.tau_y ?? undefined}
              tauMag={plotData.control.tau_mag ?? undefined}
              motorAvg={plotData.control.motors?.avg}
              motorDiff13={plotData.control.motors?.diff_13}
              motorDiff24={plotData.control.motors?.diff_24}
              yLabelLeft="τ (arb)"
              yLabelRight="motores (arb)"
            />
          </PlotCard>
          <PlotCard title="Pitch — seguimiento (est vs ref)">
            <TrackingAxisCanvas
              time={plotData.time_s}
              est={plotData.pitch.est}
              raw={plotData.pitch.raw} // opcional
              refSeries={
                plotData.pitch.ref ?? Array(plotData.time_s.length).fill(0)
              }
              yLabel="Ángulo (deg)"
              markers={(plotData.pro?.events || [])
                .filter(
                  (ev: ProEvent) =>
                    ev.channel === "pitch" && Number.isFinite(ev.t)
                )
                .map((ev: ProEvent) => ev.t)}
              titleRight="est (verde) · ref (ámbar)"
            />
          </PlotCard>
          {plotData.quick_corr && (
            <PlotCard title="Correlaciones móviles rápidas">
              <CorrelationsCanvas
                time={plotData.time_s}
                corrSeries={[
                  {
                    name: "|e_roll| ↔ |τ|",
                    data: plotData.quick_corr?.abs_err_roll_vs_tau ?? [],
                  },
                  {
                    name: "|e_pitch| ↔ |τ|",
                    data: plotData.quick_corr?.abs_err_pitch_vs_tau ?? [],
                  },
                  {
                    name: "τ ↔ (m1 - m3)",
                    data: plotData.quick_corr?.tau_vs_motor_diff_13 ?? [],
                  },
                  {
                    name: "τ ↔ (m2 - m4)",
                    data: plotData.quick_corr?.tau_vs_motor_diff_24 ?? [],
                  },
                ]}
              />
            </PlotCard>
          )}
          {/* Enlaces útiles extra (CSV de puntos) */}
          {files
            .filter((f) => /_(points)\.csv$/i.test(f.name))
            .map((f) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700"
              >
                Descargar {f.name}
              </a>
            ))}
        </div>
      ) : status === "done" ? (
        <div className="text-sm text-gray-400 mb-6">
          No se encontró <code>plot_data.json</code>. Asegúrate de haber
          agregado la exportación de datos en tu script Python.
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">
        {value}{" "}
        {suffix && <span className="text-gray-400 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}
