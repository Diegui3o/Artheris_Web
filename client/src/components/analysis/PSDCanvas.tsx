import { useRef, useEffect, useMemo } from "react";
import { downloadCanvasPNG } from "../../utils/canvasUtils";

interface PSDSeries {
  name: string;
  freq: number[];
  psd: number[];
  color?: string;
  lineWidth?: number;
  lineDash?: number[];
}

interface PSDCanvasProps {
  series: PSDSeries[];
  xLabel?: string;
  yLabel?: string;
  xScale?: "linear" | "log";
  yScale?: "linear" | "log";
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  title?: string;
}

export function PSDCanvas({
  series = [],
  xLabel = "Frecuencia (Hz)",
  yLabel = "Densidad espectral de potencia",
  xScale = "log",
  yScale = "log",
  xMin,
  xMax,
  yMin,
  yMax,
  showGrid = true,
  showLegend = true,
  title,
}: PSDCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Filter out series with no valid data
  const validSeries = useMemo(() => {
    return series.filter(
      (s) =>
        s.freq &&
        s.psd &&
        s.freq.length === s.psd.length &&
        s.psd.some((val) => val > 0)
    );
  }, [series]);

  // Calculate min/max values for scaling if not provided
  const {
    xMin: calcXMin,
    xMax: calcXMax,
    yMin: calcYMin,
    yMax: calcYMax,
  } = useMemo(() => {
    let xMinVal = xMin ?? Infinity;
    let xMaxVal = xMax ?? -Infinity;
    let yMinVal = yMin ?? Infinity;
    let yMaxVal = yMax ?? -Infinity;

    if (validSeries.length === 0) {
      return { xMin: 1, xMax: 1000, yMin: 1e-6, yMax: 1 };
    }

    // Calculate x range if not provided
    if (xMin === undefined || xMax === undefined) {
      validSeries.forEach((s) => {
        const validIndices = s.psd
          .map((val, i) => ({ val, i }))
          .filter(({ val }) => val > 0)
          .map(({ i }) => i);

        if (validIndices.length > 0) {
          xMinVal = Math.min(
            xMinVal,
            Math.min(...validIndices.map((i) => s.freq[i]))
          );
          xMaxVal = Math.max(
            xMaxVal,
            Math.max(...validIndices.map((i) => s.freq[i]))
          );
        }
      });
    }

    // Calculate y range if not provided
    if (yMin === undefined || yMax === undefined) {
      validSeries.forEach((s) => {
        const validPsd = s.psd.filter((val) => val > 0);
        if (validPsd.length > 0) {
          yMinVal = Math.min(yMinVal, Math.min(...validPsd));
          yMaxVal = Math.max(yMaxVal, Math.max(...validPsd));
        }
      });
    }

    // Apply some padding
    const yRange = Math.log10(yMaxVal) - Math.log10(yMinVal);

    return {
      xMin: xMin ?? Math.max(1e-6, xMinVal * (xScale === "log" ? 0.8 : 0.95)),
      xMax: xMax ?? xMaxVal * (xScale === "log" ? 1.2 : 1.05),
      yMin: yMin ?? Math.pow(10, Math.log10(yMinVal) - yRange * 0.1),
      yMax: yMax ?? Math.pow(10, Math.log10(yMaxVal) + yRange * 0.1),
    };
  }, [xMin, xMax, yMin, yMax, xScale, validSeries]);

  // Draw function
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || validSeries.length === 0) return;

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
    const x = (freq: number) => {
      if (xScale === "log") {
        return (
          margin.left +
          ((Math.log10(freq) - Math.log10(calcXMin)) /
            (Math.log10(calcXMax) - Math.log10(calcXMin))) *
            width
        );
      } else {
        return (
          margin.left + ((freq - calcXMin) / (calcXMax - calcXMin)) * width
        );
      }
    };

    const y = (psd: number) => {
      if (yScale === "log") {
        return (
          margin.top +
          height -
          ((Math.log10(psd) - Math.log10(calcYMin)) /
            (Math.log10(calcYMax) - Math.log10(calcYMin))) *
            height
        );
      } else {
        return (
          margin.top +
          height -
          ((psd - calcYMin) / (calcYMax - calcYMin)) * height
        );
      }
    };

    // Draw background
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;

      // X-axis grid lines (log scale)
      if (xScale === "log") {
        const startDecade = Math.ceil(Math.log10(calcXMin));
        const endDecade = Math.floor(Math.log10(calcXMax));

        for (let decade = startDecade; decade <= endDecade; decade++) {
          for (let i = 1; i <= 9; i++) {
            const freq = i * Math.pow(10, decade);
            if (freq < calcXMin || freq > calcXMax) continue;

            const xPos = x(freq);

            // Draw grid line
            ctx.beginPath();
            ctx.moveTo(xPos, margin.top);
            ctx.lineTo(xPos, margin.top + height);
            ctx.stroke();

            // Label for each decade
            if (i === 1) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
              ctx.font = "10px Arial";
              ctx.textAlign = "center";
              ctx.fillText(
                freq.toExponential(0),
                xPos,
                margin.top + height + 15
              );
            }
          }
        }
      }
      // X-axis grid lines (linear scale)
      else {
        const xStep =
          Math.pow(10, Math.floor(Math.log10(calcXMax - calcXMin))) / 2;
        const startX = Math.ceil(calcXMin / xStep) * xStep;

        for (let xVal = startX; xVal <= calcXMax; xVal += xStep) {
          const xPos = x(xVal);

          // Draw grid line
          ctx.beginPath();
          ctx.moveTo(xPos, margin.top);
          ctx.lineTo(xPos, margin.top + height);
          ctx.stroke();

          // Label
          ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
          ctx.font = "10px Arial";
          ctx.textAlign = "center";
          ctx.fillText(xVal.toExponential(2), xPos, margin.top + height + 15);
        }
      }

      // Y-axis grid lines (log scale)
      if (yScale === "log") {
        const startDecade = Math.floor(Math.log10(calcYMin));
        const endDecade = Math.ceil(Math.log10(calcYMax));

        for (let decade = startDecade; decade <= endDecade; decade++) {
          for (let i = 1; i <= 9; i++) {
            const psd = i * Math.pow(10, decade);
            if (psd < calcYMin || psd > calcYMax) continue;

            const yPos = y(psd);

            // Draw grid line
            ctx.beginPath();
            ctx.moveTo(margin.left, yPos);
            ctx.lineTo(margin.left + width, yPos);
            ctx.stroke();

            // Label for each decade
            if (i === 1) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
              ctx.font = "10px Arial";
              ctx.textAlign = "right";
              ctx.fillText(psd.toExponential(1), margin.left - 5, yPos + 4);
            }
          }
        }
      }
      // Y-axis grid lines (linear scale)
      else {
        const yStep =
          Math.pow(10, Math.floor(Math.log10(calcYMax - calcYMin))) / 2;
        const startY = Math.ceil(calcYMin / yStep) * yStep;

        for (let yVal = startY; yVal <= calcYMax; yVal += yStep) {
          const yPos = y(yVal);

          // Draw grid line
          ctx.beginPath();
          ctx.moveTo(margin.left, yPos);
          ctx.lineTo(margin.left + width, yPos);
          ctx.stroke();

          // Label
          ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
          ctx.font = "10px Arial";
          ctx.textAlign = "right";
          ctx.fillText(yVal.toExponential(2), margin.left - 5, yPos + 4);
        }
      }
    }

    // Draw axes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + height);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + height);
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(xLabel, margin.left + width / 2, margin.top + height + 30);

    // Y-axis label
    ctx.save();
    ctx.translate(margin.left - 30, margin.top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Title
    if (title) {
      ctx.fillStyle = "white";
      ctx.font = "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(title, margin.left + width / 2, margin.top - 5);
    }

    // Default colors if not provided
    const defaultColors = [
      "rgba(59, 130, 246, 0.9)", // blue
      "rgba(34, 197, 94, 0.9)", // green
      "rgba(239, 68, 68, 0.9)", // red
      "rgba(234, 179, 8, 0.9)", // yellow
      "rgba(168, 85, 247, 0.9)", // purple
      "rgba(6, 182, 212, 0.9)", // cyan
      "rgba(249, 115, 22, 0.9)", // orange
    ];

    // Draw each PSD series
    validSeries.forEach((s, idx) => {
      const color = s.color || defaultColors[idx % defaultColors.length];
      const lineWidth = s.lineWidth ?? 1.5;

      // Set line style
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (s.lineDash) {
        ctx.setLineDash(s.lineDash);
      } else {
        ctx.setLineDash([]);
      }

      // Draw the PSD line
      ctx.beginPath();

      let isFirstPoint = true;
      for (let i = 0; i < s.freq.length; i++) {
        const freq = s.freq[i];
        const psd = s.psd[i];

        if (
          freq < calcXMin ||
          freq > calcXMax ||
          psd < calcYMin ||
          psd > calcYMax
        ) {
          isFirstPoint = true;
          continue;
        }

        const xPos = x(freq);
        const yPos = y(psd);

        if (isFirstPoint) {
          ctx.moveTo(xPos, yPos);
          isFirstPoint = false;
        } else {
          ctx.lineTo(xPos, yPos);
        }
      }

      ctx.stroke();
    });

    // Reset line dash
    ctx.setLineDash([]);

    // Draw legend if enabled
    if (showLegend && validSeries.length > 0) {
      const legendX = margin.left + 10;
      let legendY = margin.top + 10;
      const legendItemHeight = 18;

      // Calculate legend width based on longest label
      ctx.font = "11px Arial";
      const maxLabelWidth = Math.max(
        ...validSeries.map((s) => {
          const metrics = ctx.measureText(s.name);
          return metrics.width;
        })
      );

      const legendWidth = Math.min(200, maxLabelWidth + 40);
      const legendHeight = validSeries.length * legendItemHeight + 10;

      // Draw legend background
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

      // Draw legend items
      validSeries.forEach((s, idx) => {
        const color = s.color || defaultColors[idx % defaultColors.length];
        const lineWidth = s.lineWidth ?? 1.5;

        // Draw color line
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        if (s.lineDash) {
          ctx.setLineDash(s.lineDash);
        }

        ctx.beginPath();
        ctx.moveTo(legendX + 5, legendY + 11);
        ctx.lineTo(legendX + 20, legendY + 11);
        ctx.stroke();

        // Reset line style
        ctx.setLineDash([]);

        // Draw text
        ctx.fillStyle = "white";
        ctx.fillText(s.name, legendX + 25, legendY + 14);

        legendY += legendItemHeight;
      });
    }
  }, [
    validSeries,
    xLabel,
    yLabel,
    xScale,
    yScale,
    calcXMin,
    calcXMax,
    calcYMin,
    calcYMax,
    showGrid,
    showLegend,
    title,
  ]);

  if (validSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 rounded-lg border border-gray-800">
        <p className="text-gray-500">No available PSD data</p>
      </div>
    );
  }

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
            canvasRef.current && downloadCanvasPNG(canvasRef.current, "psd.png")
          }
          className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-700"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}

export default PSDCanvas;
