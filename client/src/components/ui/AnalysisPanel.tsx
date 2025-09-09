import { useEffect, useMemo, useRef, useState } from "react";

type AnalysisFile = { name: string; url: string };
type AnalysisResult = { ok: boolean; status: string; files: AnalysisFile[] };
type JobStatus = "idle" | "running" | "done" | "error";

const API_BASE =
  import.meta.env.VITE_API_BASE?.toString() || "http://localhost:3002";

export interface AnalysisPanelProps {
  /** Si no lo pasas, intenta usar localStorage('lastFlightId') */
  flightId?: string | null;
  /** Si no hay flightId en props, usar lastFlightId (default true) */
  fallbackToLast?: boolean;
  /** Ejecutar automáticamente al montar (default: true) */
  autoRun?: boolean;
  /** Mostrar botón de “Reintentar” (default: true) */
  allowRetry?: boolean;
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
      roll?: {
        fs_hz?: number;
        duration_s?: number;
      };
      pitch?: {
        fs_hz?: number;
        duration_s?: number;
      };
    };
    inputs?: {
      fs_hz_est?: number;
      duration_s?: number;
    };
  }
  const [metricsJson, setMetricsJson] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const effectiveFlightId = useMemo(() => {
    if (flightId) return flightId;
    if (!fallbackToLast) return null;
    return localStorage.getItem("lastFlightId");
  }, [flightId, fallbackToLast]);

  useEffect(() => {
    if (!autoRun) return;
    if (!effectiveFlightId) return;
    startAnalysis(effectiveFlightId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFlightId, autoRun]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function startAnalysis(fId: string) {
    try {
      setError(null);
      setStatus("running");
      setFiles([]);
      setMetricsJson(null);

      const res = await fetch(`${API_BASE}/analysis/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightId: fId, debug: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const jid = data.jobId as string;
      setJobId(jid);
      pollStatus(jid);
    } catch (e: unknown) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "No se pudo iniciar el análisis");
    }
  }

  function pollStatus(jid: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/analysis/status/${jid}`);
        if (!res.ok) throw new Error(await res.text());
        const { job } = await res.json();
        const st = (job?.status as JobStatus) || "idle";
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
  }

  async function loadResults(jid: string) {
    try {
      const res = await fetch(`${API_BASE}/analysis/results/${jid}`);
      if (!res.ok) throw new Error(await res.text());
      const data: AnalysisResult = await res.json();
      const fs = data.files || [];
      setFiles(fs);

      // localizar JSON de métricas
      const metricsFile = fs.find((f) =>
        f.name.endsWith("flight_metrics.json")
      );
      if (metricsFile) {
        const mj = await fetch(metricsFile.url);
        if (mj.ok) {
          const json = await mj.json();
          setMetricsJson(json);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los resultados");
    }
  }

  const imgFiles = useMemo(
    () => files.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.name)),
    [files]
  );

  const csvLink = useMemo(
    () => files.find((f) => f.name.toLowerCase().endsWith(".csv")),
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

      {/* Galería de imágenes */}
      {status === "running" && (
        <div className="text-sm text-gray-400">Generando resultados…</div>
      )}

      {imgFiles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {imgFiles.map((f) => (
            <figure
              key={f.url}
              className="rounded-lg overflow-hidden border border-gray-800 bg-gray-900"
            >
              <img src={f.url} alt={f.name} className="w-full h-auto block" />
              <figcaption className="px-3 py-2 text-xs text-gray-300 border-t border-gray-800">
                {f.name}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : status === "done" ? (
        <div className="text-sm text-gray-400">
          No se encontraron imágenes. Verifica que tu script Python haya
          generado PNGs.
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

function fmt(n: number | string | null | undefined, d = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(d);
}
