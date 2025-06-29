import React from "react";
import Plot from "react-plotly.js";

export interface PitchChartProps {
  time: number[];
  modelPitch: number[];
  esp32KalmanPitch: number[];
  esp32Time: number[];
}

const getLimited = (arr: number[], min = -Math.PI, max = Math.PI) =>
  arr.map((v) => (isFinite(v) ? Math.max(min, Math.min(max, v)) : 0));

const PitchChart: React.FC<PitchChartProps> = ({
  time,
  modelPitch,
  esp32KalmanPitch,
  esp32Time,
}) => {
  return (
    <Plot
      data={[
        {
          x: time,
          y: getLimited(modelPitch),
          type: "scatter",
          mode: "lines",
          name: "Pitch Modelo (rad)",
          line: { color: "#0ea5e9" },
        },
        {
          x: esp32Time,
          y: getLimited(esp32KalmanPitch),
          type: "scatter",
          mode: "lines",
          name: "Pitch Kalman ESP32 (rad)",
          line: { color: "#a3e635" },
        },
      ]}
      layout={{
        title: {
          text: "Pitch (θ) en radianes",
          font: { color: "#0ea5e9", size: 20 },
        },
        xaxis: {
          title: { text: "Tiempo (s)", font: { color: "#0ea5e9" } },
          color: "#222",
        },
        yaxis: {
          title: { text: "Ángulo (rad)", font: { color: "#0ea5e9" } },
          color: "#222",
          range: [-Math.PI, Math.PI],
        },
        font: {
          color: "#0ea5e9",
          family: "Inter, Arial, sans-serif",
          size: 15,
        },
        legend: { font: { color: "#0ea5e9" } },
        paper_bgcolor: "#f8fafc",
        plot_bgcolor: "#f8fafc",
        autosize: true,
      }}
      style={{ width: "100%", height: "300px" }}
    />
  );
};

export default PitchChart;
