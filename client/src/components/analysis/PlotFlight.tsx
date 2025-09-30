import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { downloadCanvasPNG } from "../../utils/canvasUtils";

// Helper function to draw rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Axis monitoring: EST vs REF (+ optional RAW)
interface TrackingAxisCanvasProps {
  time: number[];
  est: number[] | null | undefined;
  refSeries: number[] | null | undefined;
  raw?: number[] | null | undefined;
  yLabel?: string;
  markers?: number[];
  titleRight?: string;
}

type HoverKind = "Estimation" | "Reference" | "Raw Data";
interface HoverState {
  t: number;
  v: number;
  kind: HoverKind;
}
export function TrackingAxisCanvas({
  time,
  est,
  refSeries,
  raw,
  yLabel = "",
  markers,
  titleRight,
}: TrackingAxisCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  // ranges
  const { tMin, tMax, yMin, yMax } = useMemo(() => {
    const tMin = Math.min(...time);
    const tMax = Math.max(...time);
    const allY: number[] = [
      ...(est ?? []).filter(Number.isFinite),
      ...(refSeries ?? []).filter(Number.isFinite),
      ...(raw ?? []).filter(Number.isFinite),
    ];
    const yMin0 = allY.length ? Math.min(...allY) : -1;
    const yMax0 = allY.length ? Math.max(...allY) : 1;
    const pad = (yMax0 - yMin0) * 0.05;
    return { tMin, tMax, yMin: yMin0 - pad, yMax: yMax0 + pad };
  }, [time, est, refSeries, raw]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;

    // size
    const cssW = c.clientWidth || 800;
    const cssH = 320;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = `${cssH}px`;

    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // paddings (CSS px)
    const padding = { l: 55, r: 15, t: 12, b: 28 };
    const x0 = padding.l;
    const y0 = padding.t;
    const x1 = cssW - padding.r;
    const y1 = cssH - padding.b;
    const w = x1 - x0;
    const h = y1 - y0;

    const xScale = (t: number) =>
      x0 + ((t - tMin) / Math.max(1e-12, tMax - tMin)) * w;
    const yScale = (v: number) =>
      y1 - ((v - yMin) / Math.max(1e-12, yMax - yMin)) * h;

    // background
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "rgba(17,24,39,0.9)";
    ctx.fillRect(0, 0, cssW, cssH);

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

    // axes
    ctx.strokeStyle = "rgba(148,163,184,0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // labels
    ctx.fillStyle = "rgba(203,213,225,0.8)";
    ctx.font = `12px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(yLabel, 8, 16);
    if (titleRight) {
      ctx.textAlign = "right";
      ctx.fillText(titleRight, x1, cssH - 8);
    }

    // Reference or baseline
    if (refSeries?.length) {
      ctx.strokeStyle = "rgba(250,204,21,0.9)";
      ctx.lineWidth = 1;
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

    // raw (scatter)
    if (raw?.length) {
      ctx.fillStyle = "rgba(59,130,246,0.75)";
      const r = 1.5;
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

    // est
    if (est?.length) {
      ctx.strokeStyle = "rgba(16,185,129,0.95)";
      ctx.lineWidth = 1.6;
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

    // markers
    if (markers?.length) {
      ctx.setLineDash([2, 2]);
      for (let idx = 0; idx < markers.length; idx++) {
        const tm = markers[idx];
        if (tm < tMin || tm > tMax) continue;
        const mx = xScale(tm);
        ctx.strokeStyle = `hsla(${(idx * 60) % 360}, 80%, 60%, 0.7)`;
        ctx.beginPath();
        ctx.moveTo(mx, y0);
        ctx.lineTo(mx, y1);
        ctx.stroke();
        ctx.fillStyle = `hsla(${(idx * 60) % 360}, 80%, 60%, 0.9)`;
        ctx.textAlign = "center";
        ctx.font = `10px monospace`;
        ctx.fillText(`Event ${idx + 1}`, mx, y0 + 10);
      }
      ctx.setLineDash([]);
    }

    // hover & tooltip (if exists)
    if (hover && mousePos) {
      const xh = xScale(hover.t);
      const yh = yScale(hover.v);

      // crosshair
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x0, yh);
      ctx.lineTo(x1, yh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xh, y0);
      ctx.lineTo(xh, y1);
      ctx.stroke();
      ctx.setLineDash([]);

      const color =
        hover.kind === "Estimation"
          ? "#10B981"
          : hover.kind === "Reference"
          ? "#F59E0B"
          : "#3B82F6";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xh, yh, 3, 0, Math.PI * 2);
      ctx.fill();

      // tooltip
      const lines = [
        `t = ${hover.t.toFixed(3)} s`,
        `${hover.kind}: ${hover.v.toFixed(3)}`,
      ];
      ctx.font = `11px ui-sans-serif, system-ui`;
      const pad = 8;
      const tw = Math.max(...lines.map((s) => ctx.measureText(s).width));
      const th = lines.length * 16;
      let bx = mousePos.x + 12;
      let by = mousePos.y - th / 2;
      if (bx + tw + pad * 2 > x1) bx = x1 - tw - pad * 2;
      if (by < y0) by = y0 + 4;
      if (by + th + pad * 2 > y1) by = y1 - th - pad * 2;

      ctx.fillStyle = "rgba(31,41,55,0.95)";
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      roundRect(ctx, bx, by, tw + pad * 2, th + pad * 2, 6);

      // text
      ctx.fillStyle = "#fff";
      lines.forEach((s, i) => {
        ctx.fillText(s, bx + pad, by + pad + 14 + i * 16);
      });
    }
  }, [
    time,
    est,
    refSeries,
    raw,
    yLabel,
    markers,
    titleRight,
    tMin,
    tMax,
    yMin,
    yMax,
    hover,
    mousePos,
  ]);

  // mouse handlers
  const onMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x, y });

      const padding = { l: 55, r: 15, t: 12, b: 28 };
      const x0 = padding.l;
      const x1 = rect.width - padding.r;
      const y0 = padding.t;
      const y1 = rect.height - padding.b;

      // outside plot area
      if (x < x0 || x > x1 || y < y0 || y > y1) {
        setHover(null);
        return;
      }

      // inverse scale
      const tMouse =
        tMin + ((x - x0) / Math.max(1e-12, x1 - x0)) * (tMax - tMin);
      const vMouse =
        yMax - ((y - y0) / Math.max(1e-12, y1 - y0)) * (yMax - yMin);

      // closest index by time
      let idx = 0;
      if (time.length > 1) {
        const pos = Math.floor(
          ((tMouse - tMin) / Math.max(1e-12, tMax - tMin)) * (time.length - 1)
        );
        const k0 = Math.max(0, pos - 4);
        const k1 = Math.min(time.length - 1, pos + 4);
        let best = k0,
          bestDt = Math.abs(time[k0] - tMouse);
        for (let k = k0 + 1; k <= k1; k++) {
          const dt = Math.abs(time[k] - tMouse);
          if (dt < bestDt) {
            best = k;
            bestDt = dt;
          }
        }
        idx = best;
      }

      // values at that index
      const candidates: Array<{ v: number; kind: HoverKind }> = [];
      if (est && Number.isFinite(est[idx]!))
        candidates.push({ v: est[idx]!, kind: "Estimation" });
      if (refSeries && Number.isFinite(refSeries[idx]!))
        candidates.push({ v: refSeries[idx]!, kind: "Reference" });
      if (raw && Number.isFinite(raw[idx]!))
        candidates.push({ v: raw[idx]!, kind: "Raw Data" });

      if (!candidates.length) {
        setHover(null);
        return;
      }

      // closest vertically to mouse
      let best = candidates[0];
      let bestDist = Math.abs(candidates[0].v - vMouse);
      for (let i = 1; i < candidates.length; i++) {
        const d = Math.abs(candidates[i].v - vMouse);
        if (d < bestDist) {
          best = candidates[i];
          bestDist = d;
        }
      }
      setHover({ t: time[idx], v: best.v, kind: best.kind });
    },
    [time, tMin, tMax, yMin, yMax, est, refSeries, raw]
  );

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => {
          setHover(null);
          setMousePos(null);
        }}
        className="w-full block rounded-lg border border-gray-800 bg-gray-900"
        style={{ height: 320 }}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() =>
            canvasRef.current &&
            downloadCanvasPNG(canvasRef.current, "tracking_axis.png")
          }
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 hover:bg-gray-700 text-xs"
        >
          Download PNG
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        {raw?.length ? (
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: "rgba(59,130,246,0.85)" }}
            />
            raw (points)
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ background: "rgba(16,185,129,0.95)" }}
          />
          est (line)
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
