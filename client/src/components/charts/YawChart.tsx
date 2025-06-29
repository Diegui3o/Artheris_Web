import React from "react";
import Plot from "react-plotly.js";

export interface YawChartProps {
  time: number[];
  modelYaw: number[];
  esp32RefYaw: number[]; // Puede ser Kalman si existe, si no, crudo
  esp32Time: number[];
}

const getLimited = (arr: number[], min = -Math.PI, max = Math.PI) =>
  arr.map((v) => (isFinite(v) ? Math.max(min, Math.min(max, v)) : 0));

const YawChart: React.FC<YawChartProps> = ({
  time,
  modelYaw,
  esp32RefYaw,
  esp32Time,
}) => {
  return (
    <Plot
      data={[
        {
          x: time,
          y: getLimited(modelYaw),
          type: "scatter",
          mode: "lines",
          name: "Yaw Modelo (rad)",
          line: { color: "#14b8a6" },
        },
        {
          x: esp32Time,
          y: getLimited(esp32RefYaw),
          type: "scatter",
          mode: "lines",
          name: "Yaw Referencia ESP32 (rad)",
          line: { color: "#f43f5e" },
        },
      ]}
      layout={{
        title: {
          text: "Yaw (ψ) en radianes",
          font: { color: "#14b8a6", size: 20 },
        },
        xaxis: {
          title: { text: "Tiempo (s)", font: { color: "#14b8a6" } },
          color: "#222",
        },
        yaxis: {
          title: { text: "Ángulo (rad)", font: { color: "#14b8a6" } },
          color: "#222",
          range: [-Math.PI, Math.PI],
        },
        font: {
          color: "#14b8a6",
          family: "Inter, Arial, sans-serif",
          size: 15,
        },
        legend: { font: { color: "#14b8a6" } },
        paper_bgcolor: "#f8fafc",
        plot_bgcolor: "#f8fafc",
        autosize: true,
      }}
      style={{ width: "100%", height: "300px" }}
    />
  );
};

export default YawChart;
