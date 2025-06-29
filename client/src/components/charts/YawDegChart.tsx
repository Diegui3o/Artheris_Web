import React from "react";
import Plot from "react-plotly.js";

export interface YawDegChartProps {
  time: number[];
  modelYaw: number[];
  esp32RefYaw: number[];
  esp32Time: number[];
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

const YawDegChart: React.FC<YawDegChartProps> = ({
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
          y: modelYaw.map(toDeg),
          type: "scatter",
          mode: "lines",
          name: "Yaw Modelo (°)",
          line: { color: "#14b8a6" },
        },
        {
          x: esp32Time,
          y: esp32RefYaw,
          type: "scatter",
          mode: "lines",
          name: "Yaw Referencia ESP32 (°)",
          line: { color: "#f43f5e" },
        },
      ]}
      layout={{
        title: {
          text: "Yaw (ψ) en grados",
          font: { color: "#14b8a6", size: 20 },
        },
        xaxis: {
          title: { text: "Tiempo (s)", font: { color: "#14b8a6" } },
          color: "#222",
        },
        yaxis: {
          title: { text: "Ángulo (°)", font: { color: "#14b8a6" } },
          color: "#222",
          range: [-180, 180],
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

export default YawDegChart;
