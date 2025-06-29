import React from "react";
import Plot from "react-plotly.js";

export interface PitchDegChartProps {
  time: number[];
  modelPitch: number[];
  esp32KalmanPitch: number[];
  esp32Time: number[];
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

const PitchDegChart: React.FC<PitchDegChartProps> = ({
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
          y: modelPitch.map(toDeg),
          type: "scatter",
          mode: "lines",
          name: "Pitch Modelo (°)",
          line: { color: "#0ea5e9" },
        },
        {
          x: esp32Time,
          y: esp32KalmanPitch,
          type: "scatter",
          mode: "lines",
          name: "Pitch Kalman ESP32 (°)",
          line: { color: "#a3e635" },
        },
      ]}
      layout={{
        title: {
          text: "Pitch (θ) en grados",
          font: { color: "#0ea5e9", size: 20 },
        },
        xaxis: {
          title: { text: "Tiempo (s)", font: { color: "#0ea5e9" } },
          color: "#222",
        },
        yaxis: {
          title: { text: "Ángulo (°)", font: { color: "#0ea5e9" } },
          color: "#222",
          range: [-180, 180],
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

export default PitchDegChart;
