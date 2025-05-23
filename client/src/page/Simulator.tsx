import React, { useEffect, useState } from "react";
import axios from "axios";
import Plot from "react-plotly.js";
import { io as socketIOClient, Socket } from "socket.io-client";

// --- NUEVO: Componente Tabs para agrupar gráficas ---
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

const Simulator: React.FC = () => {
  // Form state
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

  // Socket.IO connection for simulation
  useEffect(() => {
    // Consultar al backend si la simulación sigue activa al cargar la página
    axios.get("/simulate/status").then((res) => {
      if (res.data?.simActive) {
        setSimActive(true);
      } else {
        setSimActive(false);
      }
    });
  }, []);

  // Cargar historial de simulación si está activa
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
    // Usar URL absoluta para evitar problemas de proxy
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
    return () => {
      socket.disconnect();
    };
  }, [simActive]);

  // Activar/desactivar simulación
  const handleSimToggle = async () => {
    if (!simActive) {
      // Iniciar simulación
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
      // Detener simulación
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

  // Usa los datos reales si existen, si no usa los de ejemplo
  // --- NUEVO: Usar simTime del backend si está disponible ---
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

  // --- NUEVO: Gráfica de Errores (ejemplo: error de posición y orientación) ---
  const ErrorChart = () => {
    // Ejemplo: error de posición respecto a (0,0,0)
    const posError = states.map((s) =>
      Math.sqrt(s[0] ** 2 + s[1] ** 2 + s[2] ** 2)
    );
    // Ejemplo: error de orientación respecto a (0,0,0)
    const oriError = states.map((s) =>
      Math.sqrt(s[6] ** 2 + s[7] ** 2 + s[8] ** 2)
    );
    return (
      <Plot
        data={[
          {
            x: time,
            y: posError,
            type: "scatter",
            mode: "lines",
            name: "Error de Posición (m)",
            line: { color: "#eab308" },
          },
          {
            x: time,
            y: oriError,
            type: "scatter",
            mode: "lines",
            name: "Error de Orientación (rad)",
            line: { color: "#f43f5e" },
          },
        ]}
        layout={{
          title: {
            text: "Errores vs Tiempo",
            font: { color: "#eab308", size: 20 },
          },
          xaxis: {
            title: { text: "Time (s)", font: { color: "#eab308" } },
            tickfont: { color: "#222" },
            color: "#222",
          },
          yaxis: {
            title: { text: "Error", font: { color: "#eab308" } },
            tickfont: { color: "#222" },
            color: "#222",
          },
          font: {
            color: "#eab308",
            family: "Inter, Arial, sans-serif",
            size: 15,
          },
          legend: { font: { color: "#eab308" } },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#f8fafc",
          autosize: true,
        }}
        style={{ width: "100%", height: "350px" }}
      />
    );
  };

  // --- NUEVO: Gráfica de Velocidades Lineales y Angulares ---
  const VelocityChart = () => {
    return (
      <Plot
        data={[
          {
            x: time,
            y: states.map((s) => s[3]),
            type: "scatter",
            mode: "lines",
            name: "u (X) [m/s]",
            line: { color: "#0ea5e9" },
          },
          {
            x: time,
            y: states.map((s) => s[4]),
            type: "scatter",
            mode: "lines",
            name: "v (Y) [m/s]",
            line: { color: "#22d3ee" },
          },
          {
            x: time,
            y: states.map((s) => s[5]),
            type: "scatter",
            mode: "lines",
            name: "w (Z) [m/s]",
            line: { color: "#38bdf8" },
          },
          {
            x: time,
            y: states.map((s) => s[9]),
            type: "scatter",
            mode: "lines",
            name: "p (Roll rate) [rad/s]",
            line: { color: "#f472b6" },
          },
          {
            x: time,
            y: states.map((s) => s[10]),
            type: "scatter",
            mode: "lines",
            name: "q (Pitch rate) [rad/s]",
            line: { color: "#f87171" },
          },
          {
            x: time,
            y: states.map((s) => s[11]),
            type: "scatter",
            mode: "lines",
            name: "r (Yaw rate) [rad/s]",
            line: { color: "#facc15" },
          },
        ]}
        layout={{
          title: {
            text: "Velocidades Lineales y Angulares vs Tiempo",
            font: { color: "#0ea5e9", size: 20 },
          },
          xaxis: {
            title: { text: "Time (s)", font: { color: "#0ea5e9" } },
            tickfont: { color: "#222" },
            color: "#222",
          },
          yaxis: {
            title: { text: "Velocidad", font: { color: "#0ea5e9" } },
            tickfont: { color: "#222" },
            color: "#222",
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
        style={{ width: "100%", height: "350px" }}
      />
    );
  };

  // --- NUEVO: Gráficas separadas para τx, τy, τz desde ESP32 (usados en simulación) ---
  const TauXChart = () => (
    <Plot
      data={[
        {
          x: time,
          y: simData.inputs
            ? simData.inputs.map((input) => input[1])
            : [0, 0, 0, 0, 0, 0],
          type: "scatter",
          mode: "lines",
          name: "τx (ESP32)",
          line: { color: "#f472b6" },
        },
      ]}
      layout={{
        title: { text: "τx desde ESP32", font: { color: "#f472b6", size: 20 } },
        xaxis: {
          title: { text: "Time (s)", font: { color: "#f472b6" } },
          tickfont: { color: "#222" },
          color: "#222",
        },
        yaxis: {
          title: { text: "Torque X (N·m)", font: { color: "#f472b6" } },
          tickfont: { color: "#222" },
          color: "#222",
        },
        font: {
          color: "#f472b6",
          family: "Inter, Arial, sans-serif",
          size: 15,
        },
        legend: { font: { color: "#f472b6" } },
        paper_bgcolor: "#f8fafc",
        plot_bgcolor: "#f8fafc",
        autosize: true,
      }}
      style={{ width: "100%", height: "250px" }}
    />
  );

  const TauYChart = () => (
    <Plot
      data={[
        {
          x: time,
          y: simData.inputs
            ? simData.inputs.map((input) => input[2])
            : [0, 0, 0, 0, 0, 0],
          type: "scatter",
          mode: "lines",
          name: "τy (ESP32)",
          line: { color: "#facc15" },
        },
      ]}
      layout={{
        title: { text: "τy desde ESP32", font: { color: "#facc15", size: 20 } },
        xaxis: {
          title: { text: "Time (s)", font: { color: "#facc15" } },
          tickfont: { color: "#222" },
          color: "#222",
        },
        yaxis: {
          title: { text: "Torque Y (N·m)", font: { color: "#facc15" } },
          tickfont: { color: "#222" },
          color: "#222",
        },
        font: {
          color: "#facc15",
          family: "Inter, Arial, sans-serif",
          size: 15,
        },
        legend: { font: { color: "#facc15" } },
        paper_bgcolor: "#f8fafc",
        plot_bgcolor: "#f8fafc",
        autosize: true,
      }}
      style={{ width: "100%", height: "250px" }}
    />
  );

  const TauZChart = () => (
    <Plot
      data={[
        {
          x: time,
          y: simData.inputs
            ? simData.inputs.map((input) => input[3])
            : [0, 0, 0, 0, 0, 0],
          type: "scatter",
          mode: "lines",
          name: "τz (ESP32)",
          line: { color: "#38bdf8" },
        },
      ]}
      layout={{
        title: { text: "τz desde ESP32", font: { color: "#38bdf8", size: 20 } },
        xaxis: {
          title: { text: "Time (s)", font: { color: "#38bdf8" } },
          tickfont: { color: "#222" },
          color: "#222",
        },
        yaxis: {
          title: { text: "Torque Z (N·m)", font: { color: "#38bdf8" } },
          tickfont: { color: "#222" },
          color: "#222",
        },
        font: {
          color: "#38bdf8",
          family: "Inter, Arial, sans-serif",
          size: 15,
        },
        legend: { font: { color: "#38bdf8" } },
        paper_bgcolor: "#f8fafc",
        plot_bgcolor: "#f8fafc",
        autosize: true,
      }}
      style={{ width: "100%", height: "250px" }}
    />
  );

  // --- NUEVO: Gráfica de posición ---
  const PositionChart = () => {
    return (
      <Plot
        data={[
          {
            x: time,
            y: states.map((s) => s[0]),
            type: "scatter",
            mode: "lines",
            name: "x",
          },
          {
            x: time,
            y: states.map((s) => s[1]),
            type: "scatter",
            mode: "lines",
            name: "y",
          },
          {
            x: time,
            y: states.map((s) => s[2]),
            type: "scatter",
            mode: "lines",
            name: "z",
          },
        ]}
        layout={{
          title: {
            text: "Position vs Time",
            font: { color: "#1a365d", size: 20 },
          },
          xaxis: {
            title: { text: "Time (s)", font: { color: "#1a365d" } },
            tickfont: { color: "#222" },
            color: "#222",
          },
          yaxis: {
            title: { text: "Position (m)", font: { color: "#1a365d" } },
            tickfont: { color: "#222" },
            color: "#222",
          },
          font: { color: "#222", family: "Inter, Arial, sans-serif", size: 15 },
          legend: { font: { color: "#1a365d" } },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#f8fafc",
          autosize: true,
        }}
        style={{ width: "100%", height: "350px" }}
      />
    );
  };

  const ControlChart = () => {
    return (
      <Plot
        data={[
          {
            x: time,
            y: simData.inputs
              ? simData.inputs.map((input) => input[0])
              : [1, 1, 1, 1, 1, 1],
            type: "scatter",
            mode: "lines",
            name: "Thrust",
          },
          {
            x: time,
            y: simData.inputs
              ? simData.inputs.map((input) => input[1])
              : [0, 0, 0, 0, 0, 0],
            type: "scatter",
            mode: "lines",
            name: "τx",
          },
          {
            x: time,
            y: simData.inputs
              ? simData.inputs.map((input) => input[2])
              : [0, 0, 0, 0, 0, 0],
            type: "scatter",
            mode: "lines",
            name: "τy",
          },
          {
            x: time,
            y: simData.inputs
              ? simData.inputs.map((input) => input[3])
              : [0, 0, 0, 0, 0, 0],
            type: "scatter",
            mode: "lines",
            name: "τz",
          },
        ]}
        layout={{
          title: {
            text: "Control Inputs vs Time",
            font: { color: "#1a365d", size: 20 },
          },
          xaxis: {
            title: { text: "Time (s)", font: { color: "#1a365d" } },
            tickfont: { color: "#222" },
            color: "#222",
          },
          yaxis: {
            title: { text: "Input", font: { color: "#1a365d" } },
            tickfont: { color: "#222" },
            color: "#222",
          },
          font: { color: "#222", family: "Inter, Arial, sans-serif", size: 15 },
          legend: { font: { color: "#1a365d" } },
          paper_bgcolor: "#f8fafc",
          plot_bgcolor: "#f8fafc",
          autosize: true,
        }}
        style={{ width: "100%", height: "350px" }}
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
                  label: "Posición",
                  content: (
                    <div>
                      <h2 className="text-2xl font-bold mb-4 text-teal-400">
                        📈 Posición
                      </h2>
                      <PositionChart />
                    </div>
                  ),
                },
                {
                  label: "Ángulos",
                  content: (
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full">
                      {/* Columna izquierda: modelo */}
                      <div className="flex-1 flex flex-col gap-8">
                        <div>
                          <h2 className="text-2xl font-bold mb-4 text-pink-400 text-center">
                            φ (roll) Modelo
                          </h2>
                          <div className="bg-gray-900 rounded-xl p-4 shadow flex-1">
                            <Plot
                              data={[
                                {
                                  x: time,
                                  y: states.map(
                                    (s: number[]) => (s[6] * 180) / Math.PI
                                  ),
                                  type: "scatter",
                                  mode: "lines",
                                  name: "φ (roll) modelo",
                                  line: { color: "#f472b6" },
                                },
                              ]}
                              layout={{
                                title: undefined,
                                xaxis: {
                                  title: {
                                    text: "Time (s)",
                                    font: { color: "#f472b6" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                yaxis: {
                                  title: {
                                    text: "φ (deg)",
                                    font: { color: "#f472b6" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                font: {
                                  color: "#f472b6",
                                  family: "Inter, Arial, sans-serif",
                                  size: 18,
                                },
                                legend: { font: { color: "#f472b6" } },
                                paper_bgcolor: "#f8fafc",
                                plot_bgcolor: "#f8fafc",
                                autosize: true,
                              }}
                              style={{ width: "100%", height: "350px" }}
                            />
                          </div>
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold mb-4 text-yellow-400 text-center">
                            θ (pitch) Modelo
                          </h2>
                          <div className="bg-gray-900 rounded-xl p-4 shadow flex-1">
                            <Plot
                              data={[
                                {
                                  x: time,
                                  y: states.map(
                                    (s: number[]) => (s[7] * 180) / Math.PI
                                  ),
                                  type: "scatter",
                                  mode: "lines",
                                  name: "θ (pitch) modelo",
                                  line: { color: "#facc15" },
                                },
                              ]}
                              layout={{
                                title: undefined,
                                xaxis: {
                                  title: {
                                    text: "Time (s)",
                                    font: { color: "#facc15" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                yaxis: {
                                  title: {
                                    text: "θ (deg)",
                                    font: { color: "#facc15" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                font: {
                                  color: "#facc15",
                                  family: "Inter, Arial, sans-serif",
                                  size: 18,
                                },
                                legend: { font: { color: "#facc15" } },
                                paper_bgcolor: "#f8fafc",
                                plot_bgcolor: "#f8fafc",
                                autosize: true,
                              }}
                              style={{ width: "100%", height: "350px" }}
                            />
                          </div>
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold mb-4 text-blue-400 text-center">
                            ψ (yaw) Modelo
                          </h2>
                          <div className="bg-gray-900 rounded-xl p-4 shadow flex-1">
                            <Plot
                              data={[
                                {
                                  x: time,
                                  y: states.map(
                                    (s: number[]) => (s[8] * 180) / Math.PI
                                  ),
                                  type: "scatter",
                                  mode: "lines",
                                  name: "ψ (yaw) modelo",
                                  line: { color: "#38bdf8" },
                                },
                              ]}
                              layout={{
                                title: undefined,
                                xaxis: {
                                  title: {
                                    text: "Time (s)",
                                    font: { color: "#38bdf8" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                yaxis: {
                                  title: {
                                    text: "ψ (deg)",
                                    font: { color: "#38bdf8" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                font: {
                                  color: "#38bdf8",
                                  family: "Inter, Arial, sans-serif",
                                  size: 18,
                                },
                                legend: { font: { color: "#38bdf8" } },
                                paper_bgcolor: "#f8fafc",
                                plot_bgcolor: "#f8fafc",
                                autosize: true,
                              }}
                              style={{ width: "100%", height: "350px" }}
                            />
                          </div>
                        </div>
                      </div>
                      {/* Columna derecha: ESP32 */}
                      <div className="flex-1 flex flex-col gap-8">
                        <div>
                          <h2 className="text-2xl font-bold mb-4 text-pink-400 text-center">
                            φ (roll) ESP32
                          </h2>
                          <div className="bg-gray-900 rounded-xl p-4 shadow flex-1">
                            <Plot
                              data={[
                                simData.inputs &&
                                simData.inputs[0] &&
                                simData.inputs[0].length >= 7
                                  ? {
                                      x: time,
                                      y: simData.inputs.map(
                                        (input: number[]) => input[4]
                                      ),
                                      type: "scatter",
                                      mode: "lines",
                                      name: "φ (roll) ESP32",
                                      line: { color: "#a3e635" },
                                    }
                                  : undefined,
                              ].filter(Boolean)}
                              layout={{
                                title: undefined,
                                xaxis: {
                                  title: {
                                    text: "Time (s)",
                                    font: { color: "#a3e635" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                yaxis: {
                                  title: {
                                    text: "φ (deg)",
                                    font: { color: "#a3e635" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                font: {
                                  color: "#a3e635",
                                  family: "Inter, Arial, sans-serif",
                                  size: 18,
                                },
                                legend: { font: { color: "#a3e635" } },
                                paper_bgcolor: "#f8fafc",
                                plot_bgcolor: "#f8fafc",
                                autosize: true,
                              }}
                              style={{ width: "100%", height: "350px" }}
                            />
                          </div>
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold mb-4 text-yellow-400 text-center">
                            θ (pitch) ESP32
                          </h2>
                          <div className="bg-gray-900 rounded-xl p-4 shadow flex-1">
                            <Plot
                              data={[
                                simData.inputs &&
                                simData.inputs[0] &&
                                simData.inputs[0].length >= 7
                                  ? {
                                      x: time,
                                      y: simData.inputs.map(
                                        (input: number[]) => input[5]
                                      ),
                                      type: "scatter",
                                      mode: "lines",
                                      name: "θ (pitch) ESP32",
                                      line: { color: "#34d399" },
                                    }
                                  : undefined,
                              ].filter(Boolean)}
                              layout={{
                                title: undefined,
                                xaxis: {
                                  title: {
                                    text: "Time (s)",
                                    font: { color: "#34d399" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                yaxis: {
                                  title: {
                                    text: "θ (deg)",
                                    font: { color: "#34d399" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                font: {
                                  color: "#34d399",
                                  family: "Inter, Arial, sans-serif",
                                  size: 18,
                                },
                                legend: { font: { color: "#34d399" } },
                                paper_bgcolor: "#f8fafc",
                                plot_bgcolor: "#f8fafc",
                                autosize: true,
                              }}
                              style={{ width: "100%", height: "350px" }}
                            />
                          </div>
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold mb-4 text-blue-400 text-center">
                            ψ (yaw) ESP32
                          </h2>
                          <div className="bg-gray-900 rounded-xl p-4 shadow flex-1">
                            <Plot
                              data={[
                                simData.inputs &&
                                simData.inputs[0] &&
                                simData.inputs[0].length >= 7
                                  ? {
                                      x: time,
                                      y: simData.inputs.map(
                                        (input: number[]) => input[6]
                                      ),
                                      type: "scatter",
                                      mode: "lines",
                                      name: "ψ (yaw) ESP32",
                                      line: { color: "#f472b6" },
                                    }
                                  : undefined,
                              ].filter(Boolean)}
                              layout={{
                                title: undefined,
                                xaxis: {
                                  title: {
                                    text: "Time (s)",
                                    font: { color: "#f472b6" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                yaxis: {
                                  title: {
                                    text: "ψ (deg)",
                                    font: { color: "#f472b6" },
                                  },
                                  tickfont: { color: "#222" },
                                  color: "#222",
                                },
                                font: {
                                  color: "#f472b6",
                                  family: "Inter, Arial, sans-serif",
                                  size: 18,
                                },
                                legend: { font: { color: "#f472b6" } },
                                paper_bgcolor: "#f8fafc",
                                plot_bgcolor: "#f8fafc",
                                autosize: true,
                              }}
                              style={{ width: "100%", height: "350px" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  label: "Velocidades",
                  content: (
                    <div>
                      <h2 className="text-2xl font-bold mb-4 text-yellow-400">
                        ⚡ Velocidades
                      </h2>
                      <VelocityChart />
                    </div>
                  ),
                },
                {
                  label: "Torques",
                  content: (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="text-2xl font-bold mb-4 text-pink-400">
                          🟪 τx desde ESP32
                        </h2>
                        <TauXChart />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold mb-4 text-yellow-400">
                          🟨 τy desde ESP32
                        </h2>
                        <TauYChart />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold mb-4 text-blue-400">
                          🟦 τz desde ESP32
                        </h2>
                        <TauZChart />
                      </div>
                    </div>
                  ),
                },
                {
                  label: "Errores",
                  content: (
                    <div>
                      <h2 className="text-2xl font-bold mb-4 text-amber-400">
                        📉 Errores
                      </h2>
                      <ErrorChart />
                    </div>
                  ),
                },
                {
                  label: "Entradas de Control",
                  content: (
                    <div>
                      <h2 className="text-2xl font-bold mb-4 text-blue-400">
                        🕹️ Entradas de Control
                      </h2>
                      <ControlChart />
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

// --- LIMPIEZA: Importa o define Trajectory3D si no existe ---
// Si Trajectory3D no está definido, define un placeholder para evitar el error de compilación
const Trajectory3D = () => (
  <div className="text-gray-400 text-center">
    (Visualización 3D no implementada)
  </div>
);

export default Simulator;
