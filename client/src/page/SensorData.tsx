import React, { useEffect, useReducer, useCallback } from "react";
import { io } from "socket.io-client";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const socket = io("http://localhost:3002");

interface DatosSensor {
  time: string;
  roll?: number;
  pitch?: number;
  yaw?: number;
  AccX?: number;
  AccY?: number;
  AccZ?: number;
  RateRoll?: number;
  RatePitch?: number;
  RateYaw?: number;
  KalmanAngleRoll?: number;
  KalmanAnglePitch?: number;
  InputThrottle?: number;
  InputRoll?: number;
  InputPitch?: number;
  InputYaw?: number;
  MotorInput1?: number;
  MotorInput2?: number;
  MotorInput3?: number;
  MotorInput4?: number;
  Altura?: number;
  tau_x?: number;
  tau_y?: number;
  tau_z?: number;
  error_phi?: number;
  error_theta?: number;
  [key: string]: number | string | undefined;
}

const colores: Record<string, string> = {
  roll: "#b07acc",
  pitch: "#3F51B5",
  yaw: "#FF5722",
  RateRoll: "#1Ea2E5",
  RatePitch: "#F4ab00",
  RateYaw: "#F4dcca",
  GyroXdps: "#4236ab",
  GyroYdps: "#345aef",
  GyroZdps: "#3cd44d",
  KalmanAngleRoll: "#1Ea7E5",
  KalmanAnglePitch: "#a73935",
  InputThrottle: "#FDD835",
  InputRoll: "#43A047",
  InputPitch: "#FB8b0",
  InputYaw: "#5E35B1",
  MotorInput1: "#F44336",
  MotorInput2: "#d84a75",
  MotorInput3: "#3F5bB5",
  MotorInput4: "#009688",
  Height: "#00BCD4",
  tau_x: "#FF9800",
  tau_y: "#9C27B0",
  tau_z: "#8BC34A",
  error_phi: "#E91E63",
  error_theta: "#3F51B5",
};

type Action = { type: "ADD_DATA"; payload: DatosSensor[] };

const dataReducer = (state: DatosSensor[], action: Action): DatosSensor[] => {
  switch (action.type) {
    case "ADD_DATA": {
      const newData = [...state, ...action.payload];
      return newData.slice(-130);
    }
    default:
      return state;
  }
};

const MultiSensorDashboard = () => {
  const [data, dispatch] = useReducer(dataReducer, []);
  const [selectedChart, setSelectedChart] = React.useState("Roll");

  useEffect(() => {
    const handler = (nuevoDato: DatosSensor) => {
      const datoFormateado: DatosSensor = {
        ...nuevoDato,
        roll: Number(nuevoDato.roll),
        pitch: Number(nuevoDato.pitch),
        yaw: Number(nuevoDato.yaw),
        RateRoll: Number(nuevoDato.RateRoll),
        RatePitch: Number(nuevoDato.RatePitch),
        RateYaw: Number(nuevoDato.RateYaw),
        AccX: Number(nuevoDato.AccX),
        AccY: Number(nuevoDato.AccY),
        AccZ: Number(nuevoDato.AccZ),
        KalmanAngleRoll: Number(nuevoDato.KalmanAngleRoll),
        KalmanAnglePitch: Number(nuevoDato.KalmanAnglePitch),
        InputThrottle: Number(nuevoDato.InputThrottle),
        InputRoll: Number(nuevoDato.InputRoll),
        InputPitch: Number(nuevoDato.InputPitch),
        InputYaw: Number(nuevoDato.InputYaw),
        MotorInput1: Number(nuevoDato.MotorInput1),
        MotorInput2: Number(nuevoDato.MotorInput2),
        MotorInput3: Number(nuevoDato.MotorInput3),
        MotorInput4: Number(nuevoDato.MotorInput4),
        Altura: Number(nuevoDato.Altura),
        tau_x: Number(nuevoDato.tau_x),
        tau_y: Number(nuevoDato.tau_y),
        tau_z: Number(nuevoDato.tau_z),
        error_phi: Number(nuevoDato.error_phi),
        error_theta: Number(nuevoDato.error_theta),
        time: new Date(nuevoDato.time).toLocaleTimeString(),
      };
      dispatch({ type: "ADD_DATA", payload: [datoFormateado] });
    };
    // Listen both events
    socket.on("sensorUpdate", (data) => {
      handler(data);
    });
    socket.on("datosSimulacion", (data) => {
      handler(data);
    });

    return () => {
      socket.off("sensorUpdate", handler);
      socket.off("datosSimulacion", handler);
    };
  }, []);

  const renderLineChart = useCallback(
    (keys: string[], title: string) => {
      const chartData = {
        labels: data.map((d) => d.time),
        datasets: keys.map((key) => ({
          label: key,
          data: data.map((d) =>
            typeof d[key] === "number" ? (d[key] as number) : null
          ),
          borderColor: colores[key],
          backgroundColor: colores[key] + "33",
          borderWidth: 2,
          tension: 0.6,
          pointRadius: 0.7,
          fill: false,
        })),
      };

      return (
        <div style={{ width: "100%", height: "320px", marginBottom: "40px" }}>
          <h3 style={{ marginLeft: "10px" }}>{title}</h3>
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                mode: "index",
                intersect: false,
              },
              plugins: {
                legend: {
                  position: "top",
                  labels: {
                    color: "#fff",
                    font: {
                      size: 14,
                      family: "Calibri, sans-serif",
                      weight: 500,
                    },
                  },
                },
                tooltip: {
                  mode: "index",
                  intersect: false,
                },
              },
              scales: {
                x: {
                  ticks: { color: "#666" },
                  grid: { display: false },
                },
                y: {
                  ticks: { color: "#666" },
                  grid: { display: false },
                },
              },
              animation: false,
            }}
          />
        </div>
      );
    },
    [data]
  );

  const renderBarChart = useCallback(
    (keys: string[], title: string) => {
      const lastData = data[data.length - 1];
      const chartData = {
        labels: keys,
        datasets: [
          {
            label: title,
            data: keys.map((key) =>
              typeof lastData?.[key] === "number"
                ? (lastData[key] as number)
                : 0
            ),
            backgroundColor: keys.map((key) => colores[key]),
            borderRadius: 6,
            barThickness: 40,
          },
        ],
      };

      return (
        <div style={{ width: "100%", height: "250px", marginBottom: "40px" }}>
          <h3 style={{ marginLeft: "10px" }}>{title}</h3>
          <Bar
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              plugins: {
                legend: {
                  display: false,
                  labels: {
                    color: "#fff",
                    font: { size: 12 },
                  },
                },
                tooltip: {
                  mode: "index",
                  intersect: false,
                },
              },
              scales: {
                x: {
                  ticks: { color: "#ccc", font: { size: 12 } },
                  grid: { display: false },
                },
                y: {
                  ticks: {
                    color: "#ccc",
                    font: { size: 12 },
                  },
                  grid: {
                    color: "#444",
                  },
                },
              },
            }}
          />
        </div>
      );
    },
    [data]
  );

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ marginBottom: "20px" }}>
        <label htmlFor="chartSelect" style={{ marginRight: "10px" }}>
          Select chart:
        </label>
        <select
          id="chartSelect"
          onChange={(e) => setSelectedChart(e.target.value)}
          value={selectedChart}
          style={{
            color: "black",
            backgroundColor: "white",
            padding: "5px",
            borderRadius: "7px",
            fontFamily: "helvetica",
          }}
        >
          <option value="Roll">Roll Tracking </option>
          <option value="Pitch">Pitch Tracking </option>
          <option value="Rate">Rate Tracking </option>
          <option value="Tau Comparación">Tau Tracking </option>
          <option value="Input">Input Controls</option>
          <option value="Motor">Motors</option>
          <option value="Altura">Altitude</option>
          <option value="Errores">Angular Deviation</option>
        </select>
      </div>

      {selectedChart === "Roll" &&
        renderLineChart(["roll", "KalmanAngleRoll"], "Roll Comparison")}
      {selectedChart === "Pitch" &&
        renderLineChart(["pitch", "KalmanAnglePitch"], "Pitch Comparison")}
      {selectedChart === "Rate" &&
        renderLineChart(
          ["RateRoll", "RatePitch", "RateYaw"],
          "Rate Comparación"
        )}
      {selectedChart === "Tau Comparación" &&
        renderLineChart(["tau_x", "tau_y", "tau_z"], "Tau Comparison")}
      {selectedChart === "Input" &&
        renderBarChart(
          ["InputThrottle", "InputRoll", "InputPitch", "InputYaw"],
          "Input controls"
        )}
      {selectedChart === "Motor" &&
        renderBarChart(
          ["MotorInput1", "MotorInput2", "MotorInput3", "MotorInput4"],
          "Motors"
        )}
      {selectedChart === "Altura" &&
        renderLineChart(["Height"], "Height stimated")}
      {selectedChart === "Errores" &&
        renderLineChart(["error_phi", "error_theta"], "Errors")}
    </div>
  );
};

export default React.memo(MultiSensorDashboard);
