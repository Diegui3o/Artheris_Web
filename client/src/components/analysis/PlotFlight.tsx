// src/components/FlightPlots.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { downloadCanvasPNG } from "../../utils/canvasUtils";

/* ========== 1) Seguimiento por eje: est vs ref (+ raw opcional) ========== */
export function TrackingAxisCanvas({
  time,
  est,
  refSeries, // si no tienes ref en datos, pásale un array de ceros del mismo largo
  raw, // opcional (scatter)
  yLabel = "",
  markers,
  titleRight, // texto pequeño opcional en la esquina inferior derecha
}: {
  time: number[];
  est: number[] | null | undefined;
  refSeries: number[] | null | undefined;
  raw?: number[] | null | undefined;
  yLabel?: string;
  markers?: number[];
  titleRight?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ t: number; v: number } | null>(null);
  
  const downloadPng = () => {
    downloadCanvasPNG(canvasRef.current, 'tracking_axis.png');
  };


  const { tMin, tMax, yMin, yMax } = useMemo(() => {
    const tMin = Math.min(...time),
      tMax = Math.max(...time);

    const allY: number[] = [
      ...(raw ?? []).filter(Number.isFinite),
      ...(est ?? []).filter(Number.isFinite),
      ...(refSeries ?? []).filter(Number.isFinite),
    ];
    const yMin = allY.length ? Math.min(...allY) : -1;
    const yMax = allY.length ? Math.max(...allY) : 1;
    return { tMin, tMax, yMin, yMax };
  }, [time, est, refSeries, raw]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800,
      cssH = 320;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = cssH + "px";

    const padding = { l: 55, r: 15, t: 12, b: 28 };
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
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(17,24,39,0.9)";
    ctx.fillRect(0, 0, c.width, c.height);

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
    if (titleRight) {
      ctx.textAlign = "right";
      ctx.fillText(titleRight, x1, (cssH - 8) * dpr);
    }

    // referencia (línea fina) — si viene
    if (refSeries && refSeries.length) {
      ctx.strokeStyle = "rgba(250,204,21,0.9)"; // amber
      ctx.lineWidth = Math.max(1 * dpr, 0.8);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < Math.min(time.length, refSeries.length); i++) {
        const x = xScale(time[i]);
        const y = yScale(refSeries[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      // baseline y=0 (si no hay ref)
      const y0line = yScale(0);
      if (y0line >= y0 && y0line <= y1) {
        ctx.strokeStyle = "rgba(250,204,21,0.5)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y0line);
        ctx.lineTo(x1, y0line);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // raw scatter (opcional)
    if (raw && raw.length) {
      ctx.fillStyle = "rgba(59,130,246,0.75)"; // blue
      const r = Math.max(1, Math.floor(dpr));
      for (let i = 0; i < Math.min(time.length, raw.length); i++) {
        const x = xScale(time[i]),
          y = yScale(raw[i]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // est (línea principal)
    if (est && est.length) {
      ctx.strokeStyle = "rgba(16,185,129,0.95)"; // emerald
      ctx.lineWidth = Math.max(1.6 * dpr, 1.2);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < Math.min(time.length, est.length); i++) {
        const x = xScale(time[i]),
          y = yScale(est[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // marcadores (eventos)
    if (markers?.length) {
      ctx.strokeStyle = "rgba(244,114,182,0.9)"; // pink
      ctx.lineWidth = 1;
      for (const tm of markers) {
        const mx = xScale(tm);
        if (mx >= x0 && mx <= x1) {
          ctx.beginPath();
          ctx.moveTo(mx, y0);
          ctx.lineTo(mx, y1);
          ctx.stroke();
        }
      }
    }

    // hover
    if (hover) {
      const xh = xScale(hover.t),
        yh = yScale(hover.v);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(xh, y0);
      ctx.lineTo(xh, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, yh);
      ctx.lineTo(x1, yh);
      ctx.stroke();

      const text = `t=${hover.t.toFixed(3)}  v=${hover.v.toFixed(3)}`;
      const pad = 6 * dpr;
      ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
      const tw = ctx.measureText(text).width;
      const bx = Math.min(x1 - tw - pad * 2, xh + 8 * dpr);
      const by = Math.max(y0 + 4 * dpr, yh - 18 * dpr);
      ctx.fillStyle = "rgba(30,41,59,0.9)";
      ctx.fillRect(bx, by, tw + pad * 2, 18 * dpr);
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
      ctx.strokeRect(bx, by, tw + pad * 2, 18 * dpr);
      ctx.fillStyle = "rgba(226,232,240,0.95)";
      ctx.fillText(text, bx + pad, by + 13 * dpr);
    }
  }, [
    time,
    est,
    refSeries,
    raw,
    yLabel,
    markers,
    tMin,
    tMax,
    yMin,
    yMax,
    hover,
    titleRight,
  ]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const cssW = c.clientWidth;
    const x0 = 55,
      x1 = cssW - 15,
      w = x1 - x0;
    const t = tMin + ((px - x0) / Math.max(1e-6, w)) * (tMax - tMin);
    // buscar índice cercano
    let idx = 0;
    if (time.length > 1) {
      const pos = Math.floor(
        ((t - tMin) / Math.max(1e-12, tMax - tMin)) * (time.length - 1)
      );
      const k0 = Math.max(0, pos - 4),
        k1 = Math.min(time.length - 1, pos + 4);
      let best = k0,
        bestDt = Math.abs(time[k0] - t);
      for (let k = k0 + 1; k <= k1; k++) {
        const dt = Math.abs(time[k] - t);
        if (dt < bestDt) {
          best = k;
          bestDt = dt;
        }
      }
      idx = best;
    }
    if (est && est[idx] !== undefined) {
      setHover({ t: time[idx], v: est[idx] });
    }
  }
  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="w-full block rounded-lg border border-gray-800 bg-gray-900"
        style={{ height: 320 }}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={downloadPng}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700 text-xs"
        >
          Descargar PNG
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        {raw?.length ? (
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: "rgba(59,130,246,0.85)" }}
            />
            raw (puntos)
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ background: "rgba(16,185,129,0.95)" }}
          />
          est (línea)
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ background: "rgba(250,204,21,0.9)" }}
          />
          ref / baseline
        </span>
      </div>
    </div>
  );
}

/* ========== 2) Dinámica y esfuerzo: τ + motores ========== */
export function TauMotorsCanvas({
  time,
  tauX,
  tauY,
  tauMag,
  motorAvg,
  motorDiff13,
  motorDiff24,
  yLabelLeft = "τ (arb)",
  yLabelRight = "motores (arb)",
}: {
  time: number[];
  tauX?: number[] | null;
  tauY?: number[] | null;
  tauMag?: number[] | null;
  motorAvg?: number[] | null;
  motorDiff13?: number[] | null;
  motorDiff24?: number[] | null;
  yLabelLeft?: string;
  yLabelRight?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // series a mostrar (puedes quitar/añadir)
  const series = useMemo(() => {
    return [
      { name: "τx", data: tauX, color: "rgba(94,234,212,0.95)" }, // teal
      { name: "τy", data: tauY, color: "rgba(96,165,250,0.95)" }, // blue
      { name: "τmag", data: tauMag, color: "rgba(139,92,246,0.95)" }, // violet
      { name: "m_avg", data: motorAvg, color: "rgba(250,204,21,0.9)" }, // amber
      { name: "m13", data: motorDiff13, color: "rgba(244,114,182,0.95)" }, // pink
      { name: "m24", data: motorDiff24, color: "rgba(234,179,8,0.95)" }, // yellow-ish
    ].filter((s) => s.data && s.data.length);
  }, [tauX, tauY, tauMag, motorAvg, motorDiff13, motorDiff24]);

  const { tMin, tMax, yMin, yMax } = useMemo(() => {
    const tMin = Math.min(...time),
      tMax = Math.max(...time);
    const all = series.flatMap((s) => s.data!.filter(Number.isFinite));
    const yMin = all.length ? Math.min(...all) : -1;
    const yMax = all.length ? Math.max(...all) : 1;
    return { tMin, tMax, yMin, yMax };
  }, [time, series]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 800,
      cssH = 320;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = cssH + "px";

    const padding = { l: 55, r: 15, t: 12, b: 28 };
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

    // fondo + grid + ejes
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(17,24,39,0.9)";
    ctx.fillRect(0, 0, c.width, c.height);
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

    // labels
    ctx.fillStyle = "rgba(203,213,225,0.8)";
    ctx.font = `${
      12 * (window.devicePixelRatio || 1)
    }px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.fillText(
      yLabelLeft,
      8 * (window.devicePixelRatio || 1),
      16 * (window.devicePixelRatio || 1)
    );
    ctx.textAlign = "right";
    ctx.fillText(yLabelRight, x1, (cssH - 8) * (window.devicePixelRatio || 1));

    // dibujar series
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1.3 * (window.devicePixelRatio || 1), 1);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < Math.min(time.length, s.data!.length); i++) {
        const x = xScale(time[i]),
          y = yScale(s.data![i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [time, series, tMin, tMax, yMin, yMax, yLabelLeft, yLabelRight]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full block rounded-lg border border-gray-800 bg-gray-900"
        style={{ height: 320 }}
      />
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-0.5"
              style={{ background: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ========== 3) Correlaciones rápidas (rolling) ========== */

export function CorrelationsCanvas({
  time,
  corrSeries, // [{name, data}]
  yLabel = "ρ (corr móvil)",
}: {
  time: number[];
  corrSeries: { name: string; data?: number[] | null; color?: string }[];
  yLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const series = useMemo(
    () =>
      corrSeries
        .map((s, i) => ({
          ...s,
          color:
            s.color ||
            [
              "rgba(244,114,182,0.95)",
              "rgba(34,197,94,0.95)",
              "rgba(250,204,21,0.95)",
              "rgba(59,130,246,0.95)",
            ][i % 4],
        }))
        .filter((s) => s.data && s.data.length),
    [corrSeries]
  );

  const { tMin, tMax, yMin, yMax } = useMemo(() => {
    const tMin = Math.min(...time),
      tMax = Math.max(...time);
    const all = series.flatMap((s) =>
      s.data!.filter((v) => Number.isFinite(v))
    );
    const yMin = all.length ? Math.min(-1, Math.min(...all)) : -1;
    const yMax = all.length ? Math.max(1, Math.max(...all)) : 1;
    return { tMin, tMax, yMin, yMax };
  }, [time, series]);

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

    const padding = { l: 55, r: 15, t: 12, b: 28 };
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

    // fondo + grid + ejes
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(17,24,39,0.9)";
    ctx.fillRect(0, 0, c.width, c.height);
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

    // labels
    ctx.fillStyle = "rgba(203,213,225,0.8)";
    ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.fillText(yLabel, 8 * dpr, 16 * dpr);
    ctx.textAlign = "right";
    ctx.fillText("t (s)", x1, (cssH - 8) * dpr);

    // banda [-0.2, 0.2] como zona de “baja relación”
    const yL = yScale(-0.2),
      yU = yScale(0.2);
    ctx.fillStyle = "rgba(148,163,184,0.10)";
    ctx.fillRect(x0, Math.min(yL, yU), w, Math.abs(yU - yL));

    // series
    for (const s of series) {
      ctx.strokeStyle = s.color!;
      ctx.lineWidth = Math.max(1.3 * dpr, 1);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < Math.min(time.length, s.data!.length); i++) {
        const v = s.data![i];
        if (!Number.isFinite(v)) continue;
        const x = xScale(time[i]);
        const y = yScale(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [time, series, tMin, tMax, yMin, yMax, yLabel]);

  return (
    <div className="w-full">
      <canvas ref={canvasRef} /* ... */ />
      {/* export helper */}
      <div className="mt-2">
        <button
          onClick={() =>
            downloadCanvasPNG(canvasRef.current, "roll_tracking.png")
          }
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700 text-xs"
        >
          Descargar PNG
        </button>
      </div>
    </div>
  );
}
