import React from "react";
import Plot from "react-plotly.js";

interface PositionChartProps {
  time: number[];
  states: number[][];
}

const PositionChart: React.FC<PositionChartProps> = ({ time, states }) => (
  <Plot
    data={[
      {
        x: time,
        y: states.map((s) => s[0]),
        type: "scatter",
        mode: "lines",
        name: "Posición X",
        line: { color: "#3b82f6" },
      },
      {
        x: time,
        y: states.map((s) => s[1]),
        type: "scatter",
        mode: "lines",
        name: "Posición Y",
        line: { color: "#10b981" },
      },
      {
        x: time,
        y: states.map((s) => s[2]),
        type: "scatter",
        mode: "lines",
        name: "Posición Z",
        line: { color: "#f59e0b" },
      },
    ]}
    layout={{
      title: {
        text: "Posición vs Tiempo",
        font: { color: "#3b82f6", size: 18 },
      },
      xaxis: {
        title: { text: "Tiempo (s)", font: { color: "#3b82f6" } },
        color: "#222",
      },
      yaxis: {
        title: { text: "Posición (m)", font: { color: "#3b82f6" } },
        color: "#222",
      },
      font: { color: "#3b82f6" },
      paper_bgcolor: "#f8fafc",
      plot_bgcolor: "#f8fafc",
      autosize: true,
      legend: { font: { color: "#3b82f6" } },
    }}
    style={{ width: "100%", height: "350px" }}
  />
);

export default PositionChart;
