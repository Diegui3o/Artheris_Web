import React from "react";
import Plot from "react-plotly.js";

export interface RollDegChartProps {
  time: number[];
  modelRoll: number[];
  esp32KalmanRoll: number[];
  esp32Time: number[];
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

const RollDegChart: React.FC<RollDegChartProps> = ({
  time,
  modelRoll,
  esp32KalmanRoll,
  esp32Time,
}) => {
  return (
    <Plot
      data={[
        {
          x: time,
          y: modelRoll.map(toDeg),
          type: "scatter",
          mode: "lines",
          name: "Roll Modelo (°)",
          line: { color: "#6366f1" },
        },
        {
          x: esp32Time,
          y: esp32KalmanRoll,
          type: "scatter",
          mode: "lines",
          name: "Roll Kalman ESP32 (°)",
          line: { color: "#f43f5e" },
        },
      ]}
      layout={{
        title: {
          text: "Roll (φ) en grados",
          font: { color: "#6366f1", size: 20 },
        },
        xaxis: {
          title: { text: "Tiempo (s)", font: { color: "#6366f1" } },
          color: "#222",
        },
        yaxis: {
          title: { text: "Ángulo (°)", font: { color: "#6366f1" } },
          color: "#222",
          range: [-180, 180],
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

export default RollDegChart;
