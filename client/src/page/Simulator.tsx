import React, { useEffect, useState } from "react";
import axios from "axios";
import Plot from "react-plotly.js";
import { io as socketIOClient, Socket } from "socket.io-client";
import PositionChart from "../components/charts/PositionChart";

const Tabs: React.FC<{
  tabs: { label: string; content: React.ReactNode }[];
}> = ({ tabs }) => {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            className={`px-4 py-2 rounded-t-lg font-bold transition-all text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              i === active
                ? "bg-blue-700 text-white shadow"
                : "bg-gray-700 text-gray-300 hover:bg-blue-800"
            }`}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="bg-gray-800 rounded-b-2xl shadow-lg p-6">
        {tabs[active].content}
      </div>
    </div>
  );
};

const Trajectory3D = () => (
  <div className="text-gray-400 text-center">
    (Visualización 3D no implementada)
  </div>
);

const Simulator: React.FC = () => {
  const [params, setParams] = useState({
    mass: 1.0,
    Ixx: 0.0221,
    Iyy: 0.0221,
    Izz: 0.0366,
    g: 9.81,
    T: 1.0 * 9.81,
    dt: 0.01,
    initial: { x: 0, y: 0, z: 0, phi: 0, theta: 0, psi: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [simActive, setSimActive] = useState(false);
  const [simData, setSimData] = useState<{
    time: number[];
    states: number[][];
    error?: number[][];
    inputs?: number[][];
  }>({ time: [], states: [] });
  const [esp32Angles, setEsp32Angles] = useState<{
    time: number[];
    roll: number[];
    pitch: number[];
    yaw: number[];
    kalmanRoll: number[];
    kalmanPitch: number[];
    rawRoll: number[];
    rawPitch: number[];
    rawYaw: number[];
  }>({
    time: [],
    roll: [],
    pitch: [],
    yaw: [],
    kalmanRoll: [],
    kalmanPitch: [],
    rawRoll: [],
    rawPitch: [],
    rawYaw: [],
  });
  const [esp32Time, setEsp32Time] = useState<number[]>([]);

  useEffect(() => {
    axios.get("/simulate/status").then((res) => {
      if (res.data?.simActive) {
        setSimActive(true);
      } else {
        setSimActive(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!simActive) return;
    axios.get("/simulate/history").then((res) => {
      const history = Array.isArray(res.data?.history) ? res.data.history : [];
      setSimData({
        time: history.map((item: Record<string, unknown>, i: number) =>
          typeof item.simTime === "number" ? item.simTime : i * 0.03
        ),
        states: history.map((item: Record<string, unknown>) =>
          Array.isArray(item.state) ? (item.state as number[]) : []
        ),
        inputs: history.map((item: Record<string, unknown>) =>
          Array.isArray(item.inputs) ? (item.inputs as number[]) : []
        ),
      });
    });
    const socket: Socket = socketIOClient("http://localhost:3002");
    socket.on("datosSimulacion", (data) => {
      if (Array.isArray(data.state) && data.state.length === 12) {
        setSimData((prev) => ({
          time: [
            ...prev.time,
            typeof data.simTime === "number"
              ? data.simTime
              : prev.time.length > 0
              ? prev.time[prev.time.length - 1] + 0.03
              : 0,
          ],
          states: [...prev.states, data.state],
          inputs: prev.inputs ? [...prev.inputs, data.inputs] : [data.inputs],
        }));
      }
    });
    socket.on("sensorUpdate", (data) => {
      setEsp32Angles((prev) => ({
        time: [...prev.time, Date.now() / 1000],
        roll: [...prev.roll, typeof data.roll === "number" ? data.roll : 0],
        pitch: [...prev.pitch, typeof data.pitch === "number" ? data.pitch : 0],
        yaw: [...prev.yaw, typeof data.yaw === "number" ? data.yaw : 0],
        kalmanRoll: [
          ...prev.kalmanRoll,
          typeof data.KalmanAngleRoll === "number" ? data.KalmanAngleRoll : 0,
        ],
        kalmanPitch: [
          ...prev.kalmanPitch,
          typeof data.KalmanAnglePitch === "number" ? data.KalmanAnglePitch : 0,
        ],
        rawRoll: [
          ...prev.rawRoll,
          typeof data.AngleRoll === "number" ? data.AngleRoll : 0,
        ],
        rawPitch: [
          ...prev.rawPitch,
          typeof data.AnglePitch === "number" ? data.AnglePitch : 0,
        ],
        rawYaw: [
          ...prev.rawYaw,
          typeof data.AngleYaw === "number" ? data.AngleYaw : 0,
        ],
      }));
      setEsp32Time((prev) => [...prev, Date.now() / 1000]);
    });
    return () => {
      socket.disconnect();
    };
  }, [simActive]);

  const handleSimToggle = async () => {
    if (!simActive) {
      setLoading(true);
      try {
        await axios.post("/simulate/start", {
          Ixx: params.Ixx,
          Iyy: params.Iyy,
          Izz: params.Izz,
          mass: params.mass,
          g: params.g,
          T: params.T,
        });
        setSimActive(true);
      } catch {
        alert("No se pudo iniciar la simulación");
      }
      setLoading(false);
    } else {
      setLoading(true);
      try {
        await axios.post("/simulate/stop");
        setSimActive(false);
      } catch {
        alert("No se pudo detener la simulación");
      }
      setLoading(false);
    }
  };

  const time = simData.time.length > 0 ? simData.time : [0, 1, 2, 3, 4, 5];
  const states =
    simData.states.length > 0
      ? simData.states
      : [
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [1, 0.5, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [2, 1, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [3, 1.5, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [4, 2, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [5, 2.5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ];

  const VelocityXChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const velocityX = getLastN(
      states.map((s) => s[3]),
      N
    );
    const yMin = Math.min(...velocityX, -1);
    const yMax = Math.max(...velocityX, 1);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: velocityX,
            type: "scatter",
            mode: "lines+markers",
            name: "Velocidad X",
            line: { color: "#ef4444", width: 3 },
            marker: { size: 4, color: "#ef4444" },
            fill: "tonexty",
            fillcolor: "rgba(239, 68, 68, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "🚀 Velocidad X (u)",
            font: {
              color: "#ef4444",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#ef4444", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Velocidad (m/s)",
              font: { color: "#ef4444", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#ef4444",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#ef4444", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "velocityxchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const VelocityYChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const velocityY = getLastN(
      states.map((s) => s[4]),
      N
    );
    const yMin = Math.min(...velocityY, -1);
    const yMax = Math.max(...velocityY, 1);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: velocityY,
            type: "scatter",
            mode: "lines+markers",
            name: "Velocidad Y",
            line: { color: "#f97316", width: 3 },
            marker: { size: 4, color: "#f97316" },
            fill: "tonexty",
            fillcolor: "rgba(249, 115, 22, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "🚀 Velocidad Y (v)",
            font: {
              color: "#f97316",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#f97316", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Velocidad (m/s)",
              font: { color: "#f97316", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#f97316",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#f97316", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "velocityychart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const VelocityZChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const velocityZ = getLastN(
      states.map((s) => s[5]),
      N
    );
    const yMin = Math.min(...velocityZ, -1);
    const yMax = Math.max(...velocityZ, 1);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: velocityZ,
            type: "scatter",
            mode: "lines+markers",
            name: "Velocidad Z",
            line: { color: "#eab308", width: 3 },
            marker: { size: 4, color: "#eab308" },
            fill: "tonexty",
            fillcolor: "rgba(234, 179, 8, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "🚀 Velocidad Z (w)",
            font: {
              color: "#eab308",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#eab308", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Velocidad (m/s)",
              font: { color: "#eab308", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#eab308",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#eab308", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "velocityzchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  // --- NUEVO: Gráficas separadas para velocidades angulares individuales ---
  const VelocityRollRateChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const rollRate = getLastN(
      states.map((s) => s[9]),
      N
    );
    const yMin = Math.min(...rollRate, -1);
    const yMax = Math.max(...rollRate, 1);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: rollRate,
            type: "scatter",
            mode: "lines+markers",
            name: "Velocidad Angular Roll",
            line: { color: "#8b5cf6", width: 3 },
            marker: { size: 4, color: "#8b5cf6" },
            fill: "tonexty",
            fillcolor: "rgba(139, 92, 246, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "🔄 Velocidad Angular Roll (p)",
            font: {
              color: "#8b5cf6",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#8b5cf6", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Velocidad Angular (rad/s)",
              font: { color: "#8b5cf6", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#8b5cf6",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#8b5cf6", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "velocityrollchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const VelocityPitchRateChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const pitchRate = getLastN(
      states.map((s) => s[10]),
      N
    );
    const yMin = Math.min(...pitchRate, -1);
    const yMax = Math.max(...pitchRate, 1);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: pitchRate,
            type: "scatter",
            mode: "lines+markers",
            name: "Velocidad Angular Pitch",
            line: { color: "#ec4899", width: 3 },
            marker: { size: 4, color: "#ec4899" },
            fill: "tonexty",
            fillcolor: "rgba(236, 72, 153, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "🔄 Velocidad Angular Pitch (q)",
            font: {
              color: "#ec4899",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#ec4899", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Pitch (rad)",
              font: { color: "#22d3ee", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#ec4899",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#ec4899", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "velocitypitchchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const VelocityYawRateChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const yawRate = getLastN(
      states.map((s) => s[11]),
      N
    );
    const yMin = Math.min(...yawRate, -1);
    const yMax = Math.max(...yawRate, 1);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: yawRate,
            type: "scatter",
            mode: "lines+markers",
            name: "Velocidad Angular Yaw",
            line: { color: "#06b6d4", width: 3 },
            marker: { size: 4, color: "#06b6d4" },
            fill: "tonexty",
            fillcolor: "rgba(6, 182, 212, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "🔄 Velocidad Angular Yaw (r)",
            font: {
              color: "#06b6d4",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#06b6d4", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Velocidad Angular (rad/s)",
              font: { color: "#06b6d4", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#06b6d4",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#06b6d4", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "velocityyawchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  // --- NUEVO: Función de sincronización temporal perfecta ---
  const syncTimePerfectly = (
    esp32TimeArray: number[],
    simTimeArray: number[]
  ) => {
    if (esp32TimeArray.length === 0 || simTimeArray.length === 0) {
      return esp32TimeArray;
    }

    // Usar exactamente el mismo tiempo de simulación para ambos
    const simStart = simTimeArray[0];
    const simEnd = simTimeArray[simTimeArray.length - 1];
    const simDuration = simEnd - simStart;

    // Mapear los datos del ESP32 al tiempo de simulación
    return esp32TimeArray.map((_, index) => {
      const progress = index / (esp32TimeArray.length - 1);
      return simStart + progress * simDuration;
    });
  };

  // --- NUEVO: Función para obtener los últimos N puntos ---
  const getLastN = <T,>(arr: T[], n: number) =>
    arr.slice(Math.max(arr.length - n, 0));

  // --- NUEVO: Gráficas de ángulos simplificadas para mostrar claramente los datos simulados ---
  const RollChartImproved = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const rollRef = getLastN(
      esp32Angles.kalmanRoll.length > 0
        ? esp32Angles.kalmanRoll.map((deg) => (deg * Math.PI) / 180)
        : Array(time.length).fill(0),
      N
    );
    const rollSim = getLastN(
      states.map((s) => s[6]),
      N
    );
    // Rango Y automático pero centrado
    const yMin = Math.min(...rollRef, ...rollSim, -1);
    const yMax = Math.max(...rollRef, ...rollSim, 1);
    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: rollRef,
            type: "scatter",
            mode: "lines+markers",
            name: "Roll Referencia (ESP32)",
            line: { color: "#10b981", width: 3, dash: "dash" },
            marker: { size: 4, color: "#10b981" },
          },
          {
            x: simTime,
            y: rollSim,
            type: "scatter",
            mode: "lines+markers",
            name: "Roll Simulado",
            line: { color: "#0ea5e9", width: 3 },
            marker: { size: 4, color: "#0ea5e9" },
            fill: "tonexty",
            fillcolor: "rgba(14, 165, 233, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "📐 Roll (φ) - Referencia ESP32 vs Simulado",
            font: {
              color: "#0ea5e9",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#0ea5e9", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: { text: "Roll (rad)", font: { color: "#0ea5e9", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#0ea5e9",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#0ea5e9", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "rollchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const PitchChartImproved = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const pitchRef = getLastN(
      esp32Angles.kalmanPitch.length > 0
        ? esp32Angles.kalmanPitch.map((deg) => (deg * Math.PI) / 180)
        : Array(time.length).fill(0),
      N
    );
    const pitchSim = getLastN(
      states.map((s) => s[7]),
      N
    );
    // Rango Y automático pero centrado
    const yMin = Math.min(...pitchRef, ...pitchSim, -1);
    const yMax = Math.max(...pitchRef, ...pitchSim, 1);
    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: pitchRef,
            type: "scatter",
            mode: "lines+markers",
            name: "Pitch Referencia (ESP32)",
            line: { color: "#10b981", width: 3, dash: "dash" },
            marker: { size: 4, color: "#10b981" },
          },
          {
            x: simTime,
            y: pitchSim,
            type: "scatter",
            mode: "lines+markers",
            name: "Pitch Simulado",
            line: { color: "#22d3ee", width: 3 },
            marker: { size: 4, color: "#22d3ee" },
            fill: "tonexty",
            fillcolor: "rgba(34, 211, 238, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "📐 Pitch (θ) - Referencia ESP32 vs Simulado",
            font: {
              color: "#22d3ee",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#22d3ee", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Pitch (rad)",
              font: { color: "#22d3ee", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#22d3ee",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#22d3ee", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "pitchchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const YawChartImproved = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const yawRef = getLastN(
      esp32Angles.rawYaw.length > 0
        ? esp32Angles.rawYaw.map((deg) => (deg * Math.PI) / 180)
        : Array(time.length).fill(0),
      N
    );
    const yawSim = getLastN(
      states.map((s) => s[8]),
      N
    );
    // Rango Y automático pero centrado
    const yMin = Math.min(...yawRef, ...yawSim, -1);
    const yMax = Math.max(...yawRef, ...yawSim, 1);
    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: yawRef,
            type: "scatter",
            mode: "lines+markers",
            name: "Yaw Referencia (ESP32)",
            line: { color: "#10b981", width: 3, dash: "dash" },
            marker: { size: 4, color: "#10b981" },
          },
          {
            x: simTime,
            y: yawSim,
            type: "scatter",
            mode: "lines+markers",
            name: "Yaw Simulado",
            line: { color: "#38bdf8", width: 3 },
            marker: { size: 4, color: "#38bdf8" },
            fill: "tonexty",
            fillcolor: "rgba(56, 189, 248, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "📐 Yaw (ψ) - Referencia ESP32 vs Simulado",
            font: {
              color: "#38bdf8",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#38bdf8", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: { text: "Yaw (rad)", font: { color: "#38bdf8", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#38bdf8",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#38bdf8", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "yawchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  // --- NUEVO: Gráficas de ángulos en grados mejoradas ---
  const RollDegChartImproved = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const rollRef = getLastN(
      esp32Angles.kalmanRoll.length > 0
        ? esp32Angles.kalmanRoll
        : Array(time.length).fill(0),
      N
    );
    const rollSim = getLastN(
      states.map((s) => (s[6] * 180) / Math.PI),
      N
    );
    // Rango Y automático pero centrado
    const yMin = Math.min(...rollRef, ...rollSim, -1);
    const yMax = Math.max(...rollRef, ...rollSim, 1);
    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: rollRef,
            type: "scatter",
            mode: "lines+markers",
            name: "Roll Referencia (ESP32)",
            line: { color: "#10b981", width: 3, dash: "dash" },
            marker: { size: 4, color: "#10b981" },
          },
          {
            x: simTime,
            y: rollSim,
            type: "scatter",
            mode: "lines+markers",
            name: "Roll Simulado",
            line: { color: "#0ea5e9", width: 3 },
            marker: { size: 4, color: "#0ea5e9" },
            fill: "tonexty",
            fillcolor: "rgba(14, 165, 233, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "📐 Roll (φ) - Referencia ESP32 vs Simulado",
            font: {
              color: "#0ea5e9",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#0ea5e9", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: { text: "Roll (°)", font: { color: "#0ea5e9", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#0ea5e9",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#0ea5e9", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "rolldegchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const PitchDegChartImproved = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const pitchRef = getLastN(
      esp32Angles.kalmanPitch.length > 0
        ? esp32Angles.kalmanPitch
        : Array(time.length).fill(0),
      N
    );
    const pitchSim = getLastN(
      states.map((s) => (s[7] * 180) / Math.PI),
      N
    );
    // Rango Y automático pero centrado
    const yMin = Math.min(...pitchRef, ...pitchSim, -1);
    const yMax = Math.max(...pitchRef, ...pitchSim, 1);
    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: pitchRef,
            type: "scatter",
            mode: "lines+markers",
            name: "Pitch Referencia (ESP32)",
            line: { color: "#10b981", width: 3, dash: "dash" },
            marker: { size: 4, color: "#10b981" },
          },
          {
            x: simTime,
            y: pitchSim,
            type: "scatter",
            mode: "lines+markers",
            name: "Pitch Simulado",
            line: { color: "#22d3ee", width: 3 },
            marker: { size: 4, color: "#22d3ee" },
            fill: "tonexty",
            fillcolor: "rgba(34, 211, 238, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "📐 Pitch (θ) - Referencia ESP32 vs Simulado",
            font: {
              color: "#22d3ee",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#22d3ee", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Pitch (rad)",
              font: { color: "#22d3ee", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#22d3ee",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#22d3ee", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "pitchdegchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const YawDegChartImproved = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const yawRef = getLastN(
      esp32Angles.rawYaw.length > 0
        ? esp32Angles.rawYaw
        : Array(time.length).fill(0),
      N
    );
    const yawSim = getLastN(
      states.map((s) => (s[8] * 180) / Math.PI),
      N
    );
    // Rango Y automático pero centrado
    const yMin = Math.min(...yawRef, ...yawSim, -1);
    const yMax = Math.max(...yawRef, ...yawSim, 1);
    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: yawRef,
            type: "scatter",
            mode: "lines+markers",
            name: "Yaw Referencia (ESP32)",
            line: { color: "#10b981", width: 3, dash: "dash" },
            marker: { size: 4, color: "#10b981" },
          },
          {
            x: simTime,
            y: yawSim,
            type: "scatter",
            mode: "lines+markers",
            name: "Yaw Simulado",
            line: { color: "#38bdf8", width: 3 },
            marker: { size: 4, color: "#38bdf8" },
            fill: "tonexty",
            fillcolor: "rgba(56, 189, 248, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "📐 Yaw (ψ) - Referencia ESP32 vs Simulado",
            font: {
              color: "#38bdf8",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#38bdf8", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: { text: "Yaw (°)", font: { color: "#38bdf8", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#38bdf8",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#38bdf8", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "yawdegchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const Trajectory3DChart = () => {
    const N = 200;
    const x = getLastN(
      states.map((s) => s[0]),
      N
    );
    const y = getLastN(
      states.map((s) => s[1]),
      N
    );
    const z = getLastN(
      states.map((s) => s[2]),
      N
    );

    return (
      <Plot
        data={[
          {
            x: x,
            y: y,
            z: z,
            type: "scatter3d",
            mode: "lines+markers",
            name: "Trayectoria 3D",
            line: { color: "#3b82f6", width: 4 },
            marker: { size: 3, color: "#3b82f6" },
          },
        ]}
        layout={{
          title: {
            text: "🛸 Trayectoria 3D del Dron",
            font: {
              color: "#3b82f6",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          scene: {
            xaxis: {
              title: { text: "X (m)", font: { color: "#3b82f6", size: 12 } },
              tickfont: { color: "#222", size: 10 },
              color: "#222",
              gridcolor: "#e5e7eb",
              showgrid: true,
            },
            yaxis: {
              title: { text: "Y (m)", font: { color: "#3b82f6", size: 12 } },
              tickfont: { color: "#222", size: 10 },
              color: "#222",
              gridcolor: "#e5e7eb",
              showgrid: true,
            },
            zaxis: {
              title: { text: "Z (m)", font: { color: "#3b82f6", size: 12 } },
              tickfont: { color: "#222", size: 10 },
              color: "#222",
              gridcolor: "#e5e7eb",
              showgrid: true,
            },
            camera: {
              eye: { x: 1.5, y: 1.5, z: 1.5 },
            },
          },
          font: {
            color: "#3b82f6",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#3b82f6", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          uirevision: "trajectory3dchart",
        }}
        style={{ width: "100%", height: "400px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const TorqueXChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const torqueX = getLastN(simData.inputs?.map((input) => input[1]) || [], N);
    const yMin = Math.min(...torqueX) - 0.5;
    const yMax = Math.max(...torqueX) + 0.5;

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: torqueX,
            type: "scatter",
            mode: "lines+markers",
            name: "Torque X Simulado",
            line: { color: "#dc2626", width: 4 },
            marker: { size: 6, color: "#dc2626" },
            fill: "tonexty",
            fillcolor: "rgba(220, 38, 38, 0.2)",
          },
        ]}
        layout={{
          title: {
            text: "⚡ Torque X (τx) - Simulado",
            font: {
              color: "#dc2626",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#dc2626", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Torque (N⋅m) × 1000",
              font: { color: "#dc2626", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#dc2626",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#dc2626", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "torquexchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const TorqueYChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const torqueY = getLastN(simData.inputs?.map((input) => input[2]) || [], N);
    const yMin = Math.min(...torqueY, -5);
    const yMax = Math.max(...torqueY, 5);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: torqueY,
            type: "scatter",
            mode: "lines+markers",
            name: "Torque Y Simulado",
            line: { color: "#ea580c", width: 4 },
            marker: { size: 6, color: "#ea580c" },
            fill: "tonexty",
            fillcolor: "rgba(234, 88, 12, 0.2)",
          },
        ]}
        layout={{
          title: {
            text: "⚡ Torque Y (τy) - Simulado",
            font: {
              color: "#ea580c",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#ea580c", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Torque (N⋅m) × 1000",
              font: { color: "#ea580c", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#ea580c",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#ea580c", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "torqueychart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const TorqueZChart = () => {
    const N = 200;
    const simTime = getLastN(time, N);
    const torqueZ = getLastN(simData.inputs?.map((input) => input[3]) || [], N);
    const yMin = Math.min(...torqueZ, -5);
    const yMax = Math.max(...torqueZ, 5);

    return (
      <Plot
        data={[
          {
            x: simTime,
            y: torqueZ,
            type: "scatter",
            mode: "lines+markers",
            name: "Torque Z Simulado",
            line: { color: "#d97706", width: 4 },
            marker: { size: 6, color: "#d97706" },
            fill: "tonexty",
            fillcolor: "rgba(217, 119, 6, 0.2)",
          },
        ]}
        layout={{
          title: {
            text: "⚡ Torque Z (τz) - Simulado",
            font: {
              color: "#d97706",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#d97706", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              simTime.length > 0
                ? [simTime[0], simTime[simTime.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Torque (N⋅m) × 1000", // Indicar que está amplificado
              font: { color: "#d97706", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#d97706",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#d97706", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "torquezchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const ESP32TorqueXChart = () => {
    const N = 200;
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const esp32TorqueX = getLastN(
      esp32Time.map(() => 0),
      N
    );

    const yMin = Math.min(...esp32TorqueX, -5);
    const yMax = Math.max(...esp32TorqueX, 5);

    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: esp32TorqueX,
            type: "scatter",
            mode: "lines+markers",
            name: "Torque X ESP32",
            line: { color: "#ef4444", width: 4, dash: "dash" },
            marker: { size: 6, color: "#ef4444" },
            fill: "tonexty",
            fillcolor: "rgba(239, 68, 68, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "⚡ Torque X (τx) - ESP32 Real",
            font: {
              color: "#ef4444",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#ef4444", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              esp32TimeSync.length > 0
                ? [esp32TimeSync[0], esp32TimeSync[esp32TimeSync.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Torque (N⋅m)",
              font: { color: "#ef4444", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#ef4444",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#ef4444", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "esp32torquexchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const ESP32TorqueYChart = () => {
    const N = 200;
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const esp32TorqueY = getLastN(
      esp32Time.map(() => 0),
      N
    );

    const yMin = Math.min(...esp32TorqueY, -5);
    const yMax = Math.max(...esp32TorqueY, 5);

    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: esp32TorqueY,
            type: "scatter",
            mode: "lines+markers",
            name: "Torque Y ESP32",
            line: { color: "#f97316", width: 4, dash: "dash" },
            marker: { size: 6, color: "#f97316" },
            fill: "tonexty",
            fillcolor: "rgba(249, 115, 22, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "⚡ Torque Y (τy) - ESP32 Real",
            font: {
              color: "#f97316",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#f97316", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              esp32TimeSync.length > 0
                ? [esp32TimeSync[0], esp32TimeSync[esp32TimeSync.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Torque (N⋅m)",
              font: { color: "#f97316", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#f97316",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#f97316", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "esp32torqueychart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  const ESP32TorqueZChart = () => {
    const N = 200;
    const esp32TimeSync = getLastN(syncTimePerfectly(esp32Time, time), N);
    const esp32TorqueZ = getLastN(
      esp32Time.map(() => 0),
      N
    );

    const yMin = Math.min(...esp32TorqueZ, -5);
    const yMax = Math.max(...esp32TorqueZ, 5);

    return (
      <Plot
        data={[
          {
            x: esp32TimeSync,
            y: esp32TorqueZ,
            type: "scatter",
            mode: "lines+markers",
            name: "Torque Z ESP32",
            line: { color: "#eab308", width: 4, dash: "dash" },
            marker: { size: 6, color: "#eab308" },
            fill: "tonexty",
            fillcolor: "rgba(234, 179, 8, 0.1)",
          },
        ]}
        layout={{
          title: {
            text: "⚡ Torque Z (τz) - ESP32 Real",
            font: {
              color: "#eab308",
              size: 18,
              family: "Inter, Arial, sans-serif",
            },
          },
          xaxis: {
            title: { text: "Tiempo (s)", font: { color: "#eab308", size: 12 } },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range:
              esp32TimeSync.length > 0
                ? [esp32TimeSync[0], esp32TimeSync[esp32TimeSync.length - 1]]
                : undefined,
          },
          yaxis: {
            title: {
              text: "Torque (N⋅m)",
              font: { color: "#eab308", size: 12 },
            },
            tickfont: { color: "#222", size: 10 },
            color: "#222",
            gridcolor: "#e5e7eb",
            showgrid: true,
            range: [yMin, yMax],
          },
          font: {
            color: "#eab308",
            family: "Inter, Arial, sans-serif",
            size: 10,
          },
          legend: {
            font: { color: "#eab308", size: 10 },
            bgcolor: "rgba(248, 250, 252, 0.9)",
            bordercolor: "#e5e7eb",
            borderwidth: 1,
          },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#ffffff",
          autosize: true,
          margin: { l: 60, r: 30, t: 60, b: 60 },
          hovermode: "x unified",
          uirevision: "esp32torquezchart",
        }}
        style={{ width: "100%", height: "300px" }}
        config={{ responsive: true, displayModeBar: false }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white py-8 px-2">
      <div className="max-w-7xl mx-auto">
        {/* Título y controles */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold mb-2 tracking-tight text-blue-300 drop-shadow">
            🛸 Simulación del Dron
          </h1>
          <p className="mb-4 text-gray-300 text-lg">
            Visualiza el modelo del dron y los comandos{" "}
            <span className="text-blue-300 font-semibold">T, τx, τy, τz</span>{" "}
            simulados en tiempo real.
          </p>
          <form
            className="flex flex-wrap justify-center items-end gap-4 mt-2 mb-4 bg-gray-800 p-4 rounded-xl shadow"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <div className="flex flex-col items-start">
              <label className="text-sm mb-1">Masa (kg)</label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                className="bg-gray-700 text-white rounded px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={params.mass}
                onChange={(e) =>
                  setParams((p) => ({ ...p, mass: parseFloat(e.target.value) }))
                }
                disabled={simActive}
              />
            </div>
            <div className="flex flex-col items-start">
              <label className="text-sm mb-1">Ixx</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="bg-gray-700 text-white rounded px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={params.Ixx}
                onChange={(e) =>
                  setParams((p) => ({ ...p, Ixx: parseFloat(e.target.value) }))
                }
                disabled={simActive}
              />
            </div>
            <div className="flex flex-col items-start">
              <label className="text-sm mb-1">Iyy</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="bg-gray-700 text-white rounded px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={params.Iyy}
                onChange={(e) =>
                  setParams((p) => ({ ...p, Iyy: parseFloat(e.target.value) }))
                }
                disabled={simActive}
              />
            </div>
            <div className="flex flex-col items-start">
              <label className="text-sm mb-1">Izz</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="bg-gray-700 text-white rounded px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={params.Izz}
                onChange={(e) =>
                  setParams((p) => ({ ...p, Izz: parseFloat(e.target.value) }))
                }
                disabled={simActive}
              />
            </div>
            <div className="flex flex-col items-start">
              <label className="text-sm mb-1">g (m/s²)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="bg-gray-700 text-white rounded px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={params.g}
                onChange={(e) =>
                  setParams((p) => ({ ...p, g: parseFloat(e.target.value) }))
                }
                disabled={simActive}
              />
            </div>
          </form>
          <div className="flex flex-wrap justify-center items-center gap-4 mt-2">
            <button
              className={`btn ${
                simActive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              } text-white font-bold px-6 py-2 rounded-full shadow transition-all`}
              onClick={handleSimToggle}
              disabled={loading}
            >
              {simActive ? "Detener Simulación" : "Iniciar Simulación"}
            </button>
            <span
              className={`px-3 py-2 rounded-lg text-sm font-bold ${
                simActive ? "bg-green-700" : "bg-gray-700"
              }`}
            >
              Simulación: {simActive ? "Activa" : "Inactiva"}
            </span>
          </div>
        </header>

        {/* Dashboard de gráficas separadas */}
        <div className="grid grid-cols-1 w-full justify-center items-start">
          <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto">
            <div className="bg-gray-800 rounded-2xl shadow-lg p-6 flex flex-col items-center">
              <h2 className="text-2xl font-bold mb-4 text-purple-400">
                🛸 Visualización 3D del Dron
              </h2>
              <div className="w-full flex justify-center">
                <Trajectory3D />
              </div>
              <div className="mt-4 text-center text-gray-300 text-sm">
                <span className="block">
                  La orientación y trayectoria se actualizan en tiempo real
                  según los comandos recibidos.
                </span>
              </div>
            </div>
            {/* --- NUEVO: Botón para mostrar más gráficas en tabs --- */}
            <Tabs
              tabs={[
                {
                  label: "📐 Ángulos (rad)",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      <div className="flex-1 flex flex-col gap-8">
                        <RollChartImproved />
                        <PitchChartImproved />
                        <YawChartImproved />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "📐 Ángulos (deg)",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      <div className="flex-1 flex flex-col gap-8">
                        <RollDegChartImproved />
                        <PitchDegChartImproved />
                        <YawDegChartImproved />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "🚀 Velocidades Lineales",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      <div className="flex-1 flex flex-col gap-8">
                        <VelocityXChart />
                        <VelocityYChart />
                        <VelocityZChart />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "🔄 Velocidades Angulares",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      <div className="flex-1 flex flex-col gap-8">
                        <VelocityRollRateChart />
                        <VelocityPitchRateChart />
                        <VelocityYawRateChart />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "⚡ Torques Simulados",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      <div className="flex-1 flex flex-col gap-8">
                        <TorqueXChart />
                        <TorqueYChart />
                        <TorqueZChart />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "⚡ Torques ESP32",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      <div className="flex-1 flex flex-col gap-8">
                        <ESP32TorqueXChart />
                        <ESP32TorqueYChart />
                        <ESP32TorqueZChart />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "📊 Análisis",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      <div className="flex-1 flex flex-col gap-8">
                        <PositionChart time={time} states={states} />
                        <Trajectory3DChart />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "🔍 Debug",
                  content: (
                    <div className="flex flex-col items-center justify-center h-64">
                      <div className="text-gray-400 text-center">
                        <h3 className="text-xl font-bold mb-4">🔍 Debug</h3>
                        <p>Área de debug disponible para análisis avanzado</p>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Simulator;
