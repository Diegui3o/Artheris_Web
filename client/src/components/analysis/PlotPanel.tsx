import { useEffect, useMemo, useRef } from "react";

type ProStep = {
  channel: "roll" | "pitch" | string;
  rise_time_s?: number | null;
  ts_2pct_s?: number | null;
  overshoot_pct?: number | null;
};

export interface AnalysisPanelProps {
  flightId?: string | null;
  fallbackToLast?: boolean;
  autoRun?: boolean;
  allowRetry?: boolean;
}

function fmt(n: number | string | null | undefined, d = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(d);
}

/* ========= Pequeños componentes para graficar ========= */

export function PlotCard({
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
export function StepTable({ steps }: { steps: ProStep[] }) {
  const rows = steps.map((s, i) => ({
    id: i,
    channel: s.channel,
    rise: s.rise_time_s,
    settle: s.ts_2pct_s,
    over: s.overshoot_pct,
  }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-gray-300">
          <tr>
            <th className="text-left py-2 pr-3">Canal</th>
            <th className="text-right py-2 pr-3">Rise time (s)</th>
            <th className="text-right py-2 pr-3">Settling 2% (s)</th>
            <th className="text-right py-2">Overshoot (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-800">
              <td className="py-2 pr-3">{r.channel}</td>
              <td className="py-2 pr-3 text-right">{fmt(r.rise, 3)}</td>
              <td className="py-2 pr-3 text-right">{fmt(r.settle, 3)}</td>
              <td className="py-2 text-right">{fmt(r.over, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BodeMagCanvas({
  fr,
}: {
  fr: { freq_hz: number[]; mag?: number[]; mag_db?: number[] };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // NO filtres mag suelta; arma pares por índice para no desalinear
  const pts = useMemo(() => {
    const f = Array.isArray(fr?.freq_hz) ? fr.freq_hz : [];
    const magRaw = Array.isArray(fr?.mag) ? fr.mag : [];
    const dbRaw = Array.isArray(fr?.mag_db) ? fr.mag_db : [];

    const useDb =
      (!magRaw.length || magRaw.every((v) => !Number.isFinite(v) || v <= 0)) &&
      dbRaw.length;
    const mArr = useDb ? dbRaw.map((d) => Math.pow(10, d / 20)) : magRaw;

    const out: { f: number; m: number }[] = [];
    const n = Math.min(f.length, mArr.length);
    for (let i = 0; i < n; i++) {
      const fi = Number(f[i]);
      const mi = Number(mArr[i]);
      if (Number.isFinite(fi) && fi > 0 && Number.isFinite(mi) && mi > 0) {
        out.push({ f: fi, m: mi });
      }
    }
    return out;
  }, [fr]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800,
      cssH = 300;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = cssH + "px";

    // fondo + grid + ejes
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(17,24,39,0.9)";
    ctx.fillRect(0, 0, c.width, c.height);

    const padding = { l: 55, r: 15, t: 12, b: 28 };
    const x0 = padding.l * dpr,
      y0 = padding.t * dpr;
    const x1 = (cssW - padding.r) * dpr,
      y1 = (cssH - padding.b) * dpr;
    const w = x1 - x0,
      h = y1 - y0;

    // grid
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

    ctx.fillStyle = "rgba(203,213,225,0.8)";
    ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
    ctx.fillText("|H| (lineal)", 8 * dpr, 16 * dpr);
    ctx.textAlign = "right";
    ctx.fillText("f (Hz, log)", x1, (cssH - 8) * dpr);

    if (!pts.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(148,163,184,0.8)";
      ctx.fillText("Sin datos de FRF", (x0 + x1) / 2, (y0 + y1) / 2);
      return;
    }

    // dominio/escala robustos (evita log10 de <=0 y rangos nulos)
    let fMin = Math.min(...pts.map((p) => p.f));
    let fMax = Math.max(...pts.map((p) => p.f));
    if (!(fMax > fMin)) {
      fMin = Math.max(1e-3, fMin * 0.8);
      fMax = fMin * 10;
    }

    let yMin = Math.min(...pts.map((p) => p.m));
    let yMax = Math.max(...pts.map((p) => p.m));
    if (!(yMax > yMin)) {
      const pad = Math.max(1e-6, Math.abs(yMax) * 0.1 || 0.1);
      yMin -= pad;
      yMax += pad;
    }

    const xScale = (f: number) =>
      x0 +
      ((Math.log10(f) - Math.log10(fMin)) /
        Math.max(1e-12, Math.log10(fMax) - Math.log10(fMin))) *
        w;
    const yScale = (m: number) =>
      y1 - ((m - yMin) / Math.max(1e-12, yMax - yMin)) * h;

    // trazo
    ctx.strokeStyle = "rgba(139,92,246,0.9)";
    ctx.lineWidth = Math.max(1.3 * dpr, 1);
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      const x = xScale(p.f),
        y = yScale(p.m);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [pts]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full block rounded-lg border border-gray-800 bg-gray-900"
      style={{ height: 300 }}
    />
  );
}

export function BodePhaseCanvas({
  fr,
}: {
  fr: { freq_hz: number[]; phase_deg?: number[] };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const pts = useMemo(() => {
    const f = Array.isArray(fr?.freq_hz) ? fr.freq_hz : [];
    const ph = Array.isArray(fr?.phase_deg) ? fr.phase_deg : [];
    const out: { f: number; p: number }[] = [];
    const n = Math.min(f.length, ph.length);
    for (let i = 0; i < n; i++) {
      const fi = Number(f[i]),
        pi = Number(ph[i]);
      if (Number.isFinite(fi) && fi > 0 && Number.isFinite(pi))
        out.push({ f: fi, p: pi });
    }
    return out;
  }, [fr]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800,
      cssH = 300;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = cssH + "px";

    // fondo + grid + ejes (igual que arriba) ...
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(17,24,39,0.9)";
    ctx.fillRect(0, 0, c.width, c.height);

    const padding = { l: 55, r: 15, t: 12, b: 28 };
    const x0 = padding.l * dpr,
      y0 = padding.t * dpr;
    const x1 = (cssW - padding.r) * dpr,
      y1 = (cssH - padding.b) * dpr;
    const w = x1 - x0,
      h = y1 - y0;

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

    ctx.fillStyle = "rgba(203,213,225,0.8)";
    ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
    ctx.fillText("fase (deg)", 8 * dpr, 16 * dpr);
    ctx.textAlign = "right";
    ctx.fillText("f (Hz, log)", x1, (cssH - 8) * dpr);

    if (!pts.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(148,163,184,0.8)";
      ctx.fillText("Sin datos de FRF", (x0 + x1) / 2, (y0 + y1) / 2);
      return;
    }

    let fMin = Math.min(...pts.map((p) => p.f));
    let fMax = Math.max(...pts.map((p) => p.f));
    if (!(fMax > fMin)) {
      fMin = Math.max(1e-3, fMin * 0.8);
      fMax = fMin * 10;
    }

    let yMin = Math.min(...pts.map((p) => p.p));
    let yMax = Math.max(...pts.map((p) => p.p));
    if (!(yMax > yMin)) {
      yMin -= 5;
      yMax += 5;
    }

    const xScale = (f: number) =>
      x0 +
      ((Math.log10(f) - Math.log10(fMin)) /
        Math.max(1e-12, Math.log10(fMax) - Math.log10(fMin))) *
        w;
    const yScale = (p: number) =>
      y1 - ((p - yMin) / Math.max(1e-12, yMax - yMin)) * h;

    ctx.strokeStyle = "rgba(244,114,182,0.9)";
    ctx.lineWidth = Math.max(1.3 * dpr, 1);
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      const x = xScale(p.f),
        y = yScale(p.p);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [pts]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full block rounded-lg border border-gray-800 bg-gray-900"
      style={{ height: 300 }}
    />
  );
}
