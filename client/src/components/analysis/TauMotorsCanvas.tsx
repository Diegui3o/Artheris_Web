import { useRef, useEffect, useMemo } from "react";
import { downloadCanvasPNG } from "../../utils/canvasUtils";

interface TauMotorsCanvasProps {
  time: number[];
  tauX?: number[] | null;
  tauY?: number[] | null;
  tauMag?: number[] | null;
  motorAvg?: number[] | null;
  motorDiff13?: number[] | null;
  motorDiff24?: number[] | null;
  yLabelLeft?: string;
  yLabelRight?: string;
}

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
}: TauMotorsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Calculate min/max values for scaling
  const { tMin, tMax, y1Min, y1Max, y2Min, y2Max } = useMemo(() => {
    const tMin = Math.min(...time);
    const tMax = Math.max(...time);

    // Calculate Y range for tau (left axis)
    const tauValues = [
      ...(tauX || []).filter(Number.isFinite),
      ...(tauY || []).filter(Number.isFinite),
      ...(tauMag || []).filter(Number.isFinite),
    ];

    // Calculate Y range for motors (right axis)
    const motorValues = [
      ...(motorAvg || []).filter(Number.isFinite),
      ...(motorDiff13 || []).filter(Number.isFinite),
      ...(motorDiff24 || []).filter(Number.isFinite),
    ];

    const y1Min = tauValues.length ? Math.min(...tauValues) : -1;
    const y1Max = tauValues.length ? Math.max(...tauValues) : 1;
    const y2Min = motorValues.length ? Math.min(...motorValues) : -1;
    const y2Max = motorValues.length ? Math.max(...motorValues) : 1;

    const y1Pad = Math.max(0.1 * (y1Max - y1Min), 1e-6);
    const y2Pad = Math.max(0.1 * (y2Max - y2Min), 1e-6);

    return {
      tMin,
      tMax: Math.max(tMax, tMin + 1e-9),
      y1Min: y1Min - y1Pad,
      y1Max: y1Max + y1Pad,
      y2Min: y2Min - y2Pad,
      y2Max: y2Max + y2Pad,
    };
  }, [time, tauX, tauY, tauMag, motorAvg, motorDiff13, motorDiff24]);

  // Draw function
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 300 * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = "300px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Layout parameters
    const margin = { top: 20, right: 50, bottom: 40, left: 60 };
    const width = rect.width - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    // Scales
    const x = (t: number) => margin.left + ((t - tMin) / (tMax - tMin)) * width;
    const y1 = (v: number) =>
      margin.top + height - ((v - y1Min) / (y1Max - y1Min)) * height;
    const y2 = (v: number) =>
      margin.top + height - ((v - y2Min) / (y2Max - y2Min)) * height;

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    // Vertical grid lines
    for (let t = Math.ceil(tMin); t <= Math.floor(tMax); t += 1) {
      const xPos = x(t);
      ctx.beginPath();
      ctx.moveTo(xPos, margin.top);
      ctx.lineTo(xPos, margin.top + height);
      ctx.stroke();

      // X-axis labels
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(t.toFixed(1), xPos, margin.top + height + 15);
    }

    // Left Y-axis grid lines and labels
    const y1Ticks = 5;
    for (let i = 0; i <= y1Ticks; i++) {
      const v = y1Min + (i / y1Ticks) * (y1Max - y1Min);
      const yPos = y1(v);

      ctx.beginPath();
      ctx.moveTo(margin.left, yPos);
      ctx.lineTo(margin.left + width, yPos);
      ctx.stroke();

      // Left Y-axis labels
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "10px Arial";
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(1), margin.left - 5, yPos + 4);
    }

    // Right Y-axis grid lines and labels
    for (let i = 0; i <= 5; i++) {
      const v = y2Min + (i / 5) * (y2Max - y2Min);
      const yPos = y2(v);

      // Right Y-axis labels
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "10px Arial";
      ctx.textAlign = "left";
      ctx.fillText(v.toFixed(1), margin.left + width + 5, yPos + 4);
    }

    // Draw axes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + height);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();

    // Left Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + height);
    ctx.stroke();

    // Right Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left + width, margin.top);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Time (s)", margin.left + width / 2, margin.top + height + 30);

    // Left Y-axis label
    ctx.save();
    ctx.translate(margin.left - 30, margin.top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabelLeft, 0, 0);
    ctx.restore();

    // Right Y-axis label
    ctx.save();
    ctx.translate(margin.left + width + 30, margin.top + height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabelRight, 0, 0);
    ctx.restore();

    // Draw tauX (blue)
    if (tauX && tauX.length === time.length) {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < time.length; i++) {
        const xPos = x(time[i]);
        const yPos = y1(tauX[i]);

        if (i === 0) {
          ctx.moveTo(xPos, yPos);
        } else {
          ctx.lineTo(xPos, yPos);
        }
      }

      ctx.stroke();
    }

    // Draw tauY (green)
    if (tauY && tauY.length === time.length) {
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < time.length; i++) {
        const xPos = x(time[i]);
        const yPos = y1(tauY[i]);

        if (i === 0) {
          ctx.moveTo(xPos, yPos);
        } else if (Number.isFinite(yPos)) {
          ctx.lineTo(xPos, yPos);
        } else if (i < time.length - 1 && Number.isFinite(y1(tauY[i + 1]))) {
          ctx.moveTo(x(time[i + 1]), y1(tauY[i + 1]));
        }
      }

      ctx.stroke();
    }

    // Draw tauMag (red)
    if (tauMag && tauMag.length === time.length) {
      ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < time.length; i++) {
        const xPos = x(time[i]);
        const yPos = y1(tauMag[i]);

        if (i === 0) {
          ctx.moveTo(xPos, yPos);
        } else if (Number.isFinite(yPos)) {
          ctx.lineTo(xPos, yPos);
        } else if (i < time.length - 1 && Number.isFinite(y1(tauMag[i + 1]))) {
          ctx.moveTo(x(time[i + 1]), y1(tauMag[i + 1]));
        }
      }

      ctx.stroke();
    }

    // Draw motorAvg (yellow, right axis)
    if (motorAvg && motorAvg.length === time.length) {
      ctx.strokeStyle = "rgba(234, 179, 8, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();

      for (let i = 0; i < time.length; i++) {
        const xPos = x(time[i]);
        const yPos = y2(motorAvg[i]);

        if (i === 0) {
          ctx.moveTo(xPos, yPos);
        } else if (Number.isFinite(yPos)) {
          ctx.lineTo(xPos, yPos);
        } else if (
          i < time.length - 1 &&
          Number.isFinite(y2(motorAvg[i + 1]))
        ) {
          ctx.moveTo(x(time[i + 1]), y2(motorAvg[i + 1]));
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw motorDiff13 (cyan, right axis)
    if (motorDiff13 && motorDiff13.length === time.length) {
      ctx.strokeStyle = "rgba(6, 182, 212, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();

      for (let i = 0; i < time.length; i++) {
        const xPos = x(time[i]);
        const yPos = y2(motorDiff13[i]);

        if (i === 0) {
          ctx.moveTo(xPos, yPos);
        } else if (Number.isFinite(yPos)) {
          ctx.lineTo(xPos, yPos);
        } else if (
          i < time.length - 1 &&
          Number.isFinite(y2(motorDiff13[i + 1]))
        ) {
          ctx.moveTo(x(time[i + 1]), y2(motorDiff13[i + 1]));
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw motorDiff24 (magenta, right axis)
    if (motorDiff24 && motorDiff24.length === time.length) {
      ctx.strokeStyle = "rgba(219, 39, 119, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();

      for (let i = 0; i < time.length; i++) {
        const xPos = x(time[i]);
        const yPos = y2(motorDiff24[i]);

        if (i === 0) {
          ctx.moveTo(xPos, yPos);
        } else if (Number.isFinite(yPos)) {
          ctx.lineTo(xPos, yPos);
        } else if (
          i < time.length - 1 &&
          Number.isFinite(y2(motorDiff24[i + 1]))
        ) {
          ctx.moveTo(x(time[i + 1]), y2(motorDiff24[i + 1]));
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw legend
    const legendX = margin.left + 10;
    let legendY = margin.top + 10;
    const legendItemHeight = 18;

    const legendItems = [
      { label: "τ_x", color: "rgba(59, 130, 246, 0.9)", hasData: !!tauX },
      { label: "τ_y", color: "rgba(34, 197, 94, 0.9)", hasData: !!tauY },
      { label: "|τ|", color: "rgba(239, 68, 68, 0.9)", hasData: !!tauMag },
      {
        label: "Motor Avg",
        color: "rgba(234, 179, 8, 0.9)",
        hasData: !!motorAvg,
      },
      {
        label: "Motor Diff 1-3",
        color: "rgba(6, 182, 212, 0.9)",
        hasData: !!motorDiff13,
      },
      {
        label: "Motor Diff 2-4",
        color: "rgba(219, 39, 119, 0.9)",
        hasData: !!motorDiff24,
      },
    ];

    // Draw legend background
    const legendWidth = 120;
    const legendHeight =
      legendItems.filter((item) => item.hasData).length * legendItemHeight + 10;

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

    // Draw legend items
    ctx.font = "11px Arial";
    ctx.textAlign = "left";

    legendItems.forEach((item) => {
      if (!item.hasData) return;

      // Draw color swatch
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX + 5, legendY + 5, 12, 12);

      // Draw text
      ctx.fillStyle = "white";
      ctx.fillText(item.label, legendX + 22, legendY + 14);

      legendY += legendItemHeight;
    });
  }, [
    time,
    tauX,
    tauY,
    tauMag,
    motorAvg,
    motorDiff13,
    motorDiff24,
    tMin,
    tMax,
    y1Min,
    y1Max,
    y2Min,
    y2Max,
    yLabelLeft,
    yLabelRight,
  ]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full block rounded-lg border border-gray-800 bg-gray-900"
        style={{ height: 300 }}
      />
      <div className="absolute top-2 right-2">
        <button
          onClick={() =>
            canvasRef.current &&
            downloadCanvasPNG(canvasRef.current, "tau_motors.png")
          }
          className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-700"
        >
          Descargar PNG
        </button>
      </div>
    </div>
  );
}

export default TauMotorsCanvas;
