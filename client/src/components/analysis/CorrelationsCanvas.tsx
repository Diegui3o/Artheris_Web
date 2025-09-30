import { useRef, useEffect, useMemo, useCallback } from "react";
import { downloadCanvasPNG } from "../../utils/canvasUtils";

interface CorrelationSeries {
  name: string;
  data: number[];
  color?: string;
}

interface CorrelationsCanvasProps {
  time: number[];
  corrSeries: CorrelationSeries[];
  yLabel?: string;
}

export function CorrelationsCanvas({
  time,
  corrSeries = [],
  yLabel = "Correlation",
}: CorrelationsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePos = useRef({ x: -1, y: -1 });
  // Type for the closest point data
  type ClosestPoint = {
    x: number;
    y: number;
    value: number;
    name: string;
  };

  // We'll track the closest point to display in the tooltip
  const closestPointRef = useRef<ClosestPoint | null>(null);

  // Helper function to safely update the closest point
  const updateClosestPoint = useCallback((point: ClosestPoint | null) => {
    closestPointRef.current = point;
  }, []);

  // Use a type guard to ensure the point is not null
  const isClosestPoint = (
    point: ClosestPoint | null
  ): point is ClosestPoint => {
    return point !== null;
  };

  // Filter out series with no valid data
  const validSeries = useMemo(() => {
    return corrSeries.filter(
      (series) =>
        series.data &&
        Array.isArray(series.data) &&
        series.data.length === time.length &&
        series.data.some(
          (val) => val !== null && val !== undefined && Number.isFinite(val)
        )
    );
  }, [corrSeries, time]);

  // Calculate min/max values for scaling
  const { tMin, tMax, yMin, yMax } = useMemo(() => {
    const tMin = time.length > 0 ? Math.min(...time) : 0;
    const tMax = time.length > 0 ? Math.max(...time, tMin + 1e-9) : 1;

    // Find min/max across all correlation series
    let yMin = 1;
    let yMax = -1;

    validSeries.forEach((series) => {
      const validValues = series.data.filter(Number.isFinite);
      if (validValues.length > 0) {
        yMin = Math.min(yMin, Math.min(...validValues));
        yMax = Math.max(yMax, Math.max(...validValues));
      }
    });

    // Ensure we have a valid range
    if (yMin > yMax) {
      yMin = -1;
      yMax = 1;
    }

    // Add some padding
    const yRange = yMax - yMin;
    const yPad = yRange * 0.1;

    return {
      tMin,
      tMax,
      yMin: yMin - yPad,
      yMax: yMax + yPad,
    };
  }, [time, validSeries]);

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
    const x = (t: number) => margin.left + ((t - tMin) / (tMax - tMin)) * width;
    const y = (v: number) =>
      margin.top + height - ((v - yMin) / (yMax - yMin)) * height;

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

    // Horizontal grid lines and Y-axis labels
    for (let v = -1; v <= 1; v += 0.2) {
      const yPos = y(v);

      // Grid line
      ctx.beginPath();
      ctx.moveTo(margin.left, yPos);
      ctx.lineTo(margin.left + width, yPos);
      ctx.stroke();

      // Y-axis labels
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "10px Arial";
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(1), margin.left - 5, yPos + 4);
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

    // Draw zero line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    const zeroY = y(0);
    ctx.moveTo(margin.left, zeroY);
    ctx.lineTo(margin.left + width, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw labels
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Time (s)", margin.left + width / 2, margin.top + height + 30);

    // Y-axis label
    ctx.save();
    ctx.translate(margin.left - 30, margin.top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Default colors if not provided
    const defaultColors = [
      "rgba(59, 130, 246, 0.9)", // blue
      "rgba(34, 197, 94, 0.9)", // green
      "rgba(239, 68, 68, 0.9)", // red
      "rgba(234, 179, 8, 0.9)", // yellow
      "rgba(168, 85, 247, 0.9)", // purple
    ];

    // Reset closest point for this render
    updateClosestPoint(null);
    let minDistance = 20; // 20px threshold

    // Draw each correlation series and find closest point to cursor
    validSeries.forEach((series, idx) => {
      const color = series.color || defaultColors[idx % defaultColors.length];

      // Draw the line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      let isFirstPoint = true;

      for (let i = 0; i < time.length; i++) {
        const xPos = x(time[i]);
        const yPos = y(series.data[i]);

        if (!Number.isFinite(yPos)) {
          isFirstPoint = true;
          continue;
        }

        // Check if this is the closest point to the mouse
        if (mousePos.current.x >= 0 && mousePos.current.y >= 0) {
          const dx = xPos - mousePos.current.x;
          const dy = yPos - mousePos.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < minDistance) {
            minDistance = distance;
            const newPoint: ClosestPoint = {
              x: xPos,
              y: yPos,
              value: series.data[i],
              name: series.name,
            };
            updateClosestPoint(newPoint);
          }
        }

        if (isFirstPoint) {
          ctx.moveTo(xPos, yPos);
          isFirstPoint = false;
        } else {
          ctx.lineTo(xPos, yPos);
        }
      }

      ctx.stroke();
    });

    // Draw the closest point and tooltip if we have one
    const currentPoint = closestPointRef.current;
    if (isClosestPoint(currentPoint)) {
      // Draw point
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(currentPoint.x, currentPoint.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Calculate tooltip position (ensure it stays within canvas)
      const tooltipText = `${currentPoint.name}: ${currentPoint.value.toFixed(
        2
      )}`;
      const textWidth = ctx.measureText(tooltipText).width;
      const padding = 8;
      const tooltipWidth = textWidth + padding * 2;
      const tooltipHeight = 24;

      // Calculate initial tooltip position (centered above point)
      let tooltipX = currentPoint.x - tooltipWidth / 2;
      let tooltipY = currentPoint.y - tooltipHeight - 10;

      // Adjust if tooltip would go off the left edge
      if (tooltipX < margin.left) {
        tooltipX = margin.left + 5;
      }
      // Adjust if tooltip would go off the right edge
      else if (tooltipX + tooltipWidth > width + margin.left) {
        tooltipX = width + margin.left - tooltipWidth - 5;
      }

      // Adjust if tooltip would go off the top
      if (tooltipY < margin.top) {
        tooltipY = currentPoint.y + 15;

        // If it would go off the bottom, move it above the point
        if (tooltipY + tooltipHeight > height + margin.top) {
          tooltipY = margin.top + 5;
        }
      }

      // Draw tooltip background
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;

      // Draw rounded rectangle
      const radius = 4;
      ctx.beginPath();
      ctx.moveTo(tooltipX + radius, tooltipY);
      ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
      ctx.quadraticCurveTo(
        tooltipX + tooltipWidth,
        tooltipY,
        tooltipX + tooltipWidth,
        tooltipY + radius
      );
      ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
      ctx.quadraticCurveTo(
        tooltipX + tooltipWidth,
        tooltipY + tooltipHeight,
        tooltipX + tooltipWidth - radius,
        tooltipY + tooltipHeight
      );
      ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
      ctx.quadraticCurveTo(
        tooltipX,
        tooltipY + tooltipHeight,
        tooltipX,
        tooltipY + tooltipHeight - radius
      );
      ctx.lineTo(tooltipX, tooltipY + radius);
      ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
      ctx.closePath();

      ctx.fill();
      ctx.stroke();

      // Draw tooltip text
      ctx.fillStyle = "white";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        tooltipText,
        tooltipX + tooltipWidth / 2,
        tooltipY + tooltipHeight / 2
      );
    }

    // Draw legend
    const legendX = margin.left + 10;
    let legendY = margin.top + 10;
    const legendItemHeight = 18;
    const legendWidth = 150;

    // Calculate legend height based on number of series
    const legendHeight = validSeries.length * legendItemHeight + 10;

    // Draw legend background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

    // Draw legend items
    ctx.font = "11px Arial";
    ctx.textAlign = "left";

    validSeries.forEach((series, idx) => {
      const color = series.color || defaultColors[idx % defaultColors.length];

      // Draw color swatch
      ctx.fillStyle = color;
      ctx.fillRect(legendX + 5, legendY + 5, 12, 12);

      // Draw text
      ctx.fillStyle = "white";
      ctx.fillText(series.name, legendX + 22, legendY + 14);

      legendY += legendItemHeight;
    });
  }, [
    time,
    validSeries,
    tMin,
    tMax,
    yMin,
    yMax,
    yLabel,
    updateClosestPoint,
    isClosestPoint,
  ]);

  if (validSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 rounded-lg border border-gray-800">
        <p className="text-gray-500">No available correlation data</p>
      </div>
    );
  }

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    mousePos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Force redraw
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      // This will trigger the effect that draws the canvas
      canvasRef.current.dispatchEvent(new Event("mousemove"));
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    mousePos.current = { x: -1, y: -1 };
    // Force redraw to remove tooltip
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        canvasRef.current.dispatchEvent(new Event("mousemove"));
      }
    }
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full block rounded-lg border border-gray-800 bg-gray-900 cursor-crosshair"
        style={{ height: 300 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <div className="absolute top-2 right-2">
        <button
          onClick={() =>
            canvasRef.current &&
            downloadCanvasPNG(canvasRef.current, "correlations.png")
          }
          className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-700"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}

export default CorrelationsCanvas;
