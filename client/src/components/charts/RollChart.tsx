import React from "react";
import Plot from "react-plotly.js";

export interface RollChartProps {
  time: number[];
  modelRoll: number[];
  esp32KalmanRoll: number[];
  esp32Time: number[];
}

const RollChart: React.FC<RollChartProps> = ({
  time,
  modelRoll,
  esp32KalmanRoll,
  esp32Time,
}) => {
  const getLimited = (arr: number[], min = -Math.PI, max = Math.PI) =>
    arr.map((v) => (isFinite(v) ? Math.max(min, Math.min(max, v)) : 0));
  return (
    <Plot
      data={[
        {
          x: time,
          y: getLimited(modelRoll),
          type: "scatter",
          mode: "lines",
          name: "Roll Modelo (rad)",
          line: { color: "#6366f1" },
        },
        {
          x: esp32Time,
          y: getLimited(esp32KalmanRoll),
          type: "scatter",
          mode: "lines",
          name: "Roll Kalman ESP32 (rad)",
          line: { color: "#f43f5e" },
        },
      ]}
      layout={{
        title: {
          text: "Roll (φ) en radianes",
          font: { color: "#6366f1", size: 20 },
        },
        xaxis: {
          title: { text: "Tiempo (s)", font: { color: "#6366f1" } },
          color: "#222",
        },
        yaxis: {
          title: { text: "Ángulo (rad)", font: { color: "#6366f1" } },
          color: "#222",
          range: [-Math.PI, Math.PI],
        },
        font: {
          color: "#6366f1",
          family: "Inter, Arial, sans-serif",
          size: 15,
        },
        legend: { font: { color: "#6366f1" } },
        paper_bgcolor: "#f8fafc",
        plot_bgcolor: "#f8fafc",
        autosize: true,
      }}
      style={{ width: "100%", height: "300px" }}
    />
  );
};

export default RollChart;
