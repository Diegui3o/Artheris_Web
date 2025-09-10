import { useEffect, useMemo, useRef, useState } from "react";

type AnalysisFile = { name: string; url: string };
type AnalysisResult = { ok: boolean; status: string; files: AnalysisFile[] };
type ServerStatus = "pending" | "running" | "completed" | "error" | "cancelled";
type JobStatus = "idle" | "running" | "done" | "error"; // tu UI

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
  errors: { phi?: number[] | null; theta?: number[] | null };
  control: {
    tau_x?: number[] | null;
    tau_y?: number[] | null;
    tau_z?: number[] | null;
  };
  psd: {
    roll_raw: PlotPSD;
    roll_est: PlotPSD;
    pitch_raw: PlotPSD;
    pitch_est: PlotPSD;
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

  // Filter image files
  const imgFiles = useMemo(
    () =>
      files.filter((f: AnalysisFile) => /\.(png|jpg|jpeg|webp)$/i.test(f.name)),
    [files]
  );

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
      setPlotData(null); // NEW

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
      setError(
        e instanceof Error ? e.message : "No se pudo iniciar el análisis"
      );
    }
  }

  function pollStatus(jid: string) {
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
  }

  async function loadResults(jid: string) {
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
      const metricsFile = fs.find((f) =>
        f.name.endsWith("flight_metrics.json")
      );
      if (metricsFile) {
        try {
          const r = await fetch(metricsFile.url, {
            headers: { Accept: "application/json" },
          });
          const text = await r.text();
          try {
            const json = JSON.parse(text);
            setMetricsJson(json);
          } catch {
            console.warn(
              "flight_metrics.json no es JSON válido:",
              text.slice(0, 120)
            );
          }
        } catch (e) {
          console.warn("No pude leer flight_metrics.json:", e);
        }
      }
      const plotFile = fs.find((f) => f.name.endsWith("plot_data.json"));
      if (!plotFile) {
        console.warn("No se encontró plot_data.json");
      } else {
        try {
          const r = await fetch(plotFile.url, {
            headers: { Accept: "application/json" },
          });
          const text = await r.text();
          try {
            const plot = JSON.parse(text);
            setPlotData(plot);
          } catch {
            console.warn(
              "plot_data.json no es JSON válido:",
              text.slice(0, 120)
            );
          }
        } catch (e) {
          console.warn("No pude leer plot_data.json:", e);
        }
      }
    } catch (error) {
      console.error("Error loading analysis results:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load analysis results"
      );
    }
  }

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

      {/* NUEVO: Gráficas interactivas (puntos + línea) */}
      {plotData ? (
        <div className="mb-6 space-y-6">
          <PlotCard title="Roll (raw puntos + est línea)">
            <PlotCanvas
              time={plotData.time_s}
              points={plotData.roll.raw}
              line={plotData.roll.est}
              yLabel="Ángulo (deg)"
            />
          </PlotCard>
          <PlotCard title="Pitch (raw puntos + est línea)">
            <PlotCanvas
              time={plotData.time_s}
              points={plotData.pitch.raw}
              line={plotData.pitch.est}
              yLabel="Ángulo (deg)"
            />
          </PlotCard>
        </div>
      ) : status === "done" ? (
        <div className="text-sm text-gray-400 mb-6">
          No se encontró <code>plot_data.json</code>. Asegúrate de haber
          agregado la exportación de datos en tu script Python.
        </div>
      ) : null}

      {/* Galería de imágenes (opcional, si mantienes PNGs) */}
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
          generado PNGs (si aún quieres mantenerlos).
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

/* ========= Pequeños componentes para graficar ========= */

function PlotCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-200">{title}</div>
      {children}
    </div>
  );
}

function PlotCanvas({
  time,
  points, // scatter (raw)
  line, // serie (est)
  yLabel = "",
}: {
  time: number[];
  points: number[];
  line: number[];
  yLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    t: number;
    v: number;
  } | null>(null);

  // Ajuste de escalas
  const { tMin, tMax, yMin, yMax } = useMemo(() => {
    const tMin = Math.min(...time);
    const tMax = Math.max(...time);
    const allY = [...points, ...line].filter((v) => Number.isFinite(v));
    const yMin = Math.min(...allY);
    const yMax = Math.max(...allY);
    return {
      tMin,
      tMax,
      yMin: isFinite(yMin) ? yMin : -1,
      yMax: isFinite(yMax) ? yMax : 1,
    };
  }, [time, points, line]);

  const padding = { l: 50, r: 15, t: 12, b: 28 };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800;
    const cssH = 320;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = cssH + "px";

    // helpers
    const W = c.width,
      H = c.height;
    const x0 = padding.l * dpr,
      y0 = padding.t * dpr;
    const x1 = (cssW - padding.r) * dpr,
      y1 = (cssH - padding.b) * dpr;
    const w = x1 - x0,
      h = y1 - y0;

    const xScale = (t: number) =>
      x0 + ((t - tMin) / Math.max(1e-12, tMax - tMin)) * w;
    const yScale = (v: number) =>
      y1 - ((v - yMin) / Math.max(1e-12, yMax - yMin)) * h;

    // fondo
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(17,24,39,0.9)"; // bg-gray-900
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    const gridXTicks = 6,
      gridYTicks = 4;
    for (let i = 0; i <= gridXTicks; i++) {
      const xx = x0 + (i / gridXTicks) * w;
      ctx.beginPath();
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx, y1);
      ctx.stroke();
    }
    for (let j = 0; j <= gridYTicks; j++) {
      const yy = y0 + (j / gridYTicks) * h;
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.stroke();
    }

    // ejes
    ctx.strokeStyle = "rgba(148,163,184,0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // labels
    ctx.fillStyle = "rgba(203,213,225,0.8)";
    ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.fillText(yLabel, 8 * dpr, 16 * dpr);

    // scatter (raw) — puntos pequeños
    ctx.fillStyle = "rgba(59,130,246,0.75)"; // blue-500-ish
    const Np = Math.min(points.length, time.length);
    const r = Math.max(1, Math.floor(dpr)); // radio 1px (scaled)
    for (let i = 0; i < Np; i++) {
      const x = xScale(time[i]),
        y = yScale(points[i]);
      if (isFinite(x) && isFinite(y)) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // línea (est)
    ctx.strokeStyle = "rgba(16,185,129,0.9)"; // emerald-500-ish
    ctx.lineWidth = Math.max(1.3 * dpr, 1);
    ctx.beginPath();
    let started = false;
    const Nl = Math.min(line.length, time.length);
    for (let i = 0; i < Nl; i++) {
      const x = xScale(time[i]),
        y = yScale(line[i]);
      if (!isFinite(x) || !isFinite(y)) continue;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // hover guía
    if (hover) {
      const hx = xScale(hover.t),
        hy = yScale(hover.v);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, y0);
      ctx.lineTo(hx, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, hy);
      ctx.lineTo(x1, hy);
      ctx.stroke();

      // tooltip
      const pad = 6 * dpr;
      const text = `t=${hover.t.toFixed(3)}s  v=${hover.v.toFixed(3)}`;
      ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
      const tw = ctx.measureText(text).width;
      const bx = Math.min(x1 - tw - pad * 2, hx + 8 * dpr);
      const by = Math.max(y0 + 4 * dpr, hy - 18 * dpr);
      ctx.fillStyle = "rgba(30,41,59,0.9)";
      ctx.fillRect(bx, by, tw + pad * 2, 18 * dpr);
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
      ctx.strokeRect(bx, by, tw + pad * 2, 18 * dpr);
      ctx.fillStyle = "rgba(226,232,240,0.95)";
      ctx.fillText(text, bx + pad, by + 13 * dpr);
    }
  }, [
    time,
    points,
    line,
    tMin,
    tMax,
    yMin,
    yMax,
    yLabel,
    hover,
    padding.b,
    padding.l,
    padding.r,
    padding.t,
  ]);

  // interacción simple: hover sobre la serie "line" (kalman)
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const cssW = c.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    const x0 = 50,
      x1 = cssW - 15;
    const w = x1 - x0;

    // t desde pixel
    const t = tMin + ((px - x0) / Math.max(1e-6, w)) * (tMax - tMin);
    // busca el índice más cercano en "time"
    let idx = 0;
    if (time.length > 1) {
      const pos = Math.max(
        0,
        Math.min(
          time.length - 1,
          Math.floor(((t - tMin) / (tMax - tMin)) * (time.length - 1))
        )
      );
      // refina localmente
      let best = pos,
        bestDt = Math.abs(time[pos] - t);
      for (
        let k = Math.max(0, pos - 4);
        k <= Math.min(time.length - 1, pos + 4);
        k++
      ) {
        const dt = Math.abs(time[k] - t);
        if (dt < bestDt) {
          best = k;
          bestDt = dt;
        }
      }
      idx = best;
    }
    setHover({ x: px * dpr, y: 0, t: time[idx], v: line[idx] });
  }
  function onLeave() {
    setHover(null);
  }

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="w-full block rounded-lg border border-gray-800 bg-gray-900"
        style={{ height: 320 }}
      />
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: "rgba(59,130,246,0.85)" }}
          />
          raw (puntos)
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ background: "rgba(16,185,129,0.9)" }}
          />
          est (línea)
        </span>
      </div>
    </div>
  );
}
