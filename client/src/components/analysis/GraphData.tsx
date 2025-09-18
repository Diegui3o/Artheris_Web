function downloadCanvasPNG(canvas: HTMLCanvasElement | null, filename: string) {
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

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

import { TrackingAxisCanvas } from "./PlotFlight";
import {
  PlotCard,
  StepTable,
  BodeMagCanvas,
  BodePhaseCanvas,
} from "./PlotPanel";
import { TauMotorsCanvas } from "./TauMotorsCanvas";

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

interface FRFData {
  freq_hz: number[];
  mag_db?: number[] | null;
  mag?: number[] | null;
  phase_deg?: number[] | null;
  phase?: number[] | null;
  coh?: number[];
}

function normalizeFRF(fr?: FRFData | null) {
  if (!fr || !fr.freq_hz) return null;
  const f = fr.freq_hz.map(Number);

  const mag_db = fr.mag_db?.length
    ? fr.mag_db
    : fr.mag?.length
    ? fr.mag.map((m) => 20 * Math.log10(Math.max(Number(m), 1e-12)))
    : null;

  const phase_deg = fr.phase_deg?.length
    ? fr.phase_deg
    : fr.phase?.length
    ? fr.phase.map((p) => (Number(p) * 180) / Math.PI)
    : null;

  // filtra triples coherentes y finitos
  const outF: number[] = [];
  const outMag: number[] = [];
  const outPh: number[] = [];
  for (let i = 0; i < f.length; i++) {
    const okF = Number.isFinite(f[i]);
    const okM = !mag_db || Number.isFinite(mag_db[i]);
    const okP = !phase_deg || Number.isFinite(phase_deg[i]);
    if (okF && okM && okP) {
      outF.push(f[i]);
      if (mag_db) outMag.push(mag_db[i]);
      if (phase_deg) outPh.push(phase_deg[i]);
    }
  }
  if (outF.length < 2) return null;

  return {
    freq_hz: outF,
    mag_db: mag_db ? outMag : undefined,
    phase_deg: phase_deg ? outPh : undefined,
    coh: (fr.coh || []).slice(0, outF.length),
  };
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
  meta: {
    fs_hz: number;
    n: number;
    columns: string[];
    labels?: Record<string, string>;
    units?: Record<string, string>;
  };
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
/* ========== 4) Estimación de movimiento 2D (desde ángulos) ========== */

export function Motion2DCanvas({
  time,
  rollDeg,
  pitchDeg,
  g = 9.81,
  leak = 0.02,
  smoothWin = 0,
  scaleLabel = "m",
  title = "Recorrido estimado (top-down)",
}: {
  time: number[];
  rollDeg: number[] | null | undefined;
  pitchDeg: number[] | null | undefined;
  g?: number;
  leak?: number;
  smoothWin?: number;
  scaleLabel?: string;
  title?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Suavizado opcional simple (media móvil)
  const smooth = useCallback(
    (arr: number[] | null | undefined) => {
      if (!arr || !arr.length || smoothWin <= 1) return arr || [];
      const k = Math.max(1, Math.floor(smoothWin));
      const out = new Array(arr.length).fill(0);
      let acc = 0;
      for (let i = 0; i < arr.length; i++) {
        acc += arr[i];
        if (i >= k) acc -= arr[i - k];
        out[i] = acc / Math.min(i + 1, k);
      }
      return out;
    },
    [smoothWin]
  );

  // Cálculo de trayectoria (no uniforme en tiempo)
  const { path, bbox } = useMemo(() => {
    const phi =
      (smooth((rollDeg ?? []).filter(Number.isFinite)) as number[]).length ===
      (rollDeg?.length || 0)
        ? smooth(rollDeg || [])
        : (rollDeg || []).map((v) => (Number.isFinite(v) ? v : 0));
    const theta =
      (smooth((pitchDeg ?? []).filter(Number.isFinite)) as number[]).length ===
      (pitchDeg?.length || 0)
        ? smooth(pitchDeg || [])
        : (pitchDeg || []).map((v) => (Number.isFinite(v) ? v : 0));

    const n = Math.min(time.length, phi.length, theta.length);
    const path: { x: number; y: number; t: number }[] = [];
    if (n < 3) return { path, bbox: { xmin: 0, xmax: 1, ymin: 0, ymax: 1 } };

    // estados
    let vx = 0,
      vy = 0;
    let x = 0,
      y = 0;

    const deg2rad = (d: number) => (d * Math.PI) / 180;
    const kLeak = (dt: number) => Math.max(0, 1 - leak * Math.max(0, dt)); // factor [0..1]

    for (let i = 1; i < n; i++) {
      const dt = Math.max(0, time[i] - time[i - 1]);
      if (!Number.isFinite(dt) || dt <= 0) {
        path.push({ x, y, t: time[i] });
        continue;
      }

      const ax = g * Math.tan(deg2rad(theta[i] || 0));
      const ay = -g * Math.tan(deg2rad(phi[i] || 0));

      // integración con fuga (leaky) para v y s
      vx = vx * kLeak(dt) + ax * dt;
      vy = vy * kLeak(dt) + ay * dt;

      x = x * kLeak(dt) + vx * dt;
      y = y * kLeak(dt) + vy * dt;

      if (Number.isFinite(x) && Number.isFinite(y)) {
        path.push({ x, y, t: time[i] });
      } else {
        path.push({ x: 0, y: 0, t: time[i] });
      }
    }

    // bounding box
    const xs = path.map((p) => p.x),
      ys = path.map((p) => p.y);
    const xmin = Math.min(...xs, -1),
      xmax = Math.max(...xs, 1);
    const ymin = Math.min(...ys, -1),
      ymax = Math.max(...ys, 1);
    return { path, bbox: { xmin, xmax, ymin, ymax } };
  }, [smooth, rollDeg, pitchDeg, time, leak, g]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 600,
      cssH = 360;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = cssH + "px";

    // fondo
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(17,24,39,0.9)";
    ctx.fillRect(0, 0, c.width, c.height);

    const padding = { l: 55, r: 20, t: 24, b: 38 };
    const x0 = padding.l * dpr,
      y0 = padding.t * dpr;
    const x1 = (cssW - padding.r) * dpr,
      y1 = (cssH - padding.b) * dpr;
    const w = x1 - x0,
      h = y1 - y0;

    // grid + ejes
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const xx = x0 + (i / 6) * w;
      ctx.beginPath();
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx, y1);
      ctx.stroke();
    }
    for (let j = 0; j <= 4; j++) {
      const yy = y0 + (j / 4) * h;
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(148,163,184,0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // etiquetas
    ctx.fillStyle = "rgba(203,213,225,0.9)";
    ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.fillText(title, 8 * dpr, 18 * dpr);
    ctx.textAlign = "right";
    ctx.fillText(scaleLabel, x1, (cssH - 10) * dpr);

    // nada para dibujar
    if (!path.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(148,163,184,0.8)";
      ctx.fillText("Sin datos", (x0 + x1) / 2, (y0 + y1) / 2);
      return;
    }

    // escalado con aspecto 1:1 (mismo factor en X e Y)
    const { xmin, xmax, ymin, ymax } = bbox;
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    // padding 10%
    const sx = (xmax - xmin) * 1.1 || 1;
    const sy = (ymax - ymin) * 1.1 || 1;
    // usa mismo factor para mantener aspecto
    const scale = Math.min(w / sx, h / sy);
    const xToPx = (x: number) => x0 + (x - (cx - sx / 2)) * scale;
    const yToPx = (y: number) => y1 - (y - (cy - sy / 2)) * scale;

    // trayectoria
    ctx.strokeStyle = "rgba(16,185,129,0.95)";
    ctx.lineWidth = Math.max(1.6 * dpr, 1.2);
    ctx.beginPath();
    let started = false;
    for (const p of path) {
      const X = xToPx(p.x),
        Y = yToPx(p.y);
      if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
      if (!started) {
        ctx.moveTo(X, Y);
        started = true;
      } else {
        ctx.lineTo(X, Y);
      }
    }
    ctx.stroke();

    // punto inicio y fin
    const p0 = path[0],
      pN = path[path.length - 1];
    // inicio (círculo)
    ctx.fillStyle = "rgba(59,130,246,0.9)";
    ctx.beginPath();
    ctx.arc(xToPx(p0.x), yToPx(p0.y), 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    // fin (cuadrado)
    ctx.fillStyle = "rgba(250,204,21,0.95)";
    ctx.fillRect(
      xToPx(pN.x) - 3 * dpr,
      yToPx(pN.y) - 3 * dpr,
      6 * dpr,
      6 * dpr
    );
  }, [path, bbox, title, scaleLabel, leak, g, smoothWin]);

  // Export helper
  const onDownload = () => downloadCanvasPNG(canvasRef.current, "motion2d.png");

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full block rounded-lg border border-gray-800 bg-gray-900"
        style={{ height: 360 }}
      />
      <div className="mt-2">
        <button
          onClick={onDownload}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700 text-xs"
        >
          Descargar PNG
        </button>
      </div>
      <div className="mt-1 text-[11px] text-gray-400">
        Modelo simplificado: a_x≈g·tan(θ), a_y≈−g·tan(φ), integración con fuga
        (leak={leak} s⁻¹).
      </div>
    </div>
  );
}

export default function AnalysisPanel({
  flightId,
  fallbackToLast = true,
  autoRun = true,
  allowRetry = true,
}: AnalysisPanelProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [plotData, setPlotData] = useState<PlotData | null>(null);
  const [files, setFiles] = useState<AnalysisFile[]>([]);

  // Calculate FRF data when plotData changes
  const { frRoll, frPitch } = useMemo(() => {
    const frRoll = normalizeFRF(plotData?.pro?.frf?.ref_to_est);
    const frPitch = normalizeFRF(plotData?.pro?.frf_pitch?.ref_to_est);
    return { frRoll, frPitch };
  }, [plotData]);
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
          <h2 className="text-lg font-semibold">📈 Graficas de vuelo</h2>
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
            {status === "running" ? "Procesando…" : "Generar graficas"}
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
        {plotJsonLink && (
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
      {/* Tabla de respuesta a escalón */}
      {(() => {
        const steps = plotData?.pro?.step_responses;
        const events = plotData?.pro?.events;

        // Count steps per channel if events exist
        const rollEvents =
          events?.filter((e) => e.channel === "roll").length ?? 0;
        const pitchEvents =
          events?.filter((e) => e.channel === "pitch").length ?? 0;

        if (!Array.isArray(steps)) {
          return null; // No step data available
        }

        if (steps.length > 0) {
          return (
            <PlotCard title="Respuesta a escalón (detectada)">
              <StepTable steps={steps} />
            </PlotCard>
          );
        }

        // Show message with event counts if no steps were found
        return (
          <div className="text-sm text-gray-400 mb-4">
            No se detectaron escalones en la referencia.
            {events && (
              <span className="block mt-1 text-gray-500 text-xs">
                (Eventos detectados: roll={rollEvents}, pitch={pitchEvents})
              </span>
            )}
          </div>
        );
      })()}
      {/* Bode (FRF ref→est) ROLL */}
      {frRoll && (
        <div className="grid md:grid-cols-2 gap-6">
          <PlotCard title="Bode Roll (|H|) ref→est">
            <BodeMagCanvas fr={frRoll} />
          </PlotCard>
          <PlotCard title="Bode Roll (∠H) ref→est">
            <BodePhaseCanvas fr={frRoll} />
          </PlotCard>
        </div>
      )}
      {frPitch && (
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <PlotCard title="Bode Pitch (|H|) ref→est">
            <BodeMagCanvas fr={frPitch} />
          </PlotCard>
          <PlotCard title="Bode Pitch (∠H) ref→est">
            <BodePhaseCanvas fr={frPitch} />
          </PlotCard>
        </div>
      )}
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
          {plotData && (
            <PlotCard title="Estimación de movimiento (derivado de ángulos)">
              <Motion2DCanvas
                time={plotData.time_s}
                rollDeg={plotData.roll.est} // φ estimado (deg)
                pitchDeg={plotData.pitch.est} // θ estimado (deg)
                g={9.81}
                leak={0.02} // puedes subir a 0.05 si ves deriva
                smoothWin={7} // opcional: suaviza ángulos
                scaleLabel="m"
                title="Recorrido estimado (vista superior)"
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
