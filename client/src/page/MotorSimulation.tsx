import { useEffect, useReducer } from "react";
import { io } from "socket.io-client";
import SwitchControl from "./SwitchMode";
import Plot from "react-plotly.js";

const socket = io("http://localhost:3002");

interface DatosSensor {
  time: string;
  MotorInput1?: number;
  MotorInput2?: number;
  MotorInput3?: number;
  MotorInput4?: number;
  [key: string]: number | string | undefined;
}

const coloresMotores: Record<string, string> = {
  MotorInput1: "#F44336", // Rojo
  MotorInput2: "#4CAF50", // Verde
  MotorInput3: "#2196F3", // Azul
  MotorInput4: "#FFC107", // Amarillo
};

type Action = { type: "ADD_DATA"; payload: DatosSensor[] };

const dataReducer = (state: DatosSensor[], action: Action): DatosSensor[] => {
  switch (action.type) {
    case "ADD_DATA": {
      const newData = [...state, ...action.payload];
      return newData.slice(-100); // Guarda los últimos 100 datos
    }
    default:
      return state;
  }
};

const MotorDashboard = () => {
  const [data, dispatch] = useReducer(dataReducer, []);

  useEffect(() => {
    const handler = (nuevoDato: DatosSensor) => {
      const datoFormateado: DatosSensor = {
        time: new Date(nuevoDato.time).toLocaleTimeString(),
        MotorInput1: Math.min(
          Math.max(Number(nuevoDato.MotorInput1), 1000),
          2000
        ),
        MotorInput2: Math.min(
          Math.max(Number(nuevoDato.MotorInput2), 1000),
          2000
        ),
        MotorInput3: Math.min(
          Math.max(Number(nuevoDato.MotorInput3), 1000),
          2000
        ),
        MotorInput4: Math.min(
          Math.max(Number(nuevoDato.MotorInput4), 1000),
          2000
        ),
        AngleRoll: Number(nuevoDato.AngleRoll) || 0,
        AnglePitch: Number(nuevoDato.AnglePitch) || 0,
        AngleYaw: Number(nuevoDato.AngleYaw) || 0,
        KalmanAngleRoll: Number(nuevoDato.KalmanAngleRoll) || 0,
        KalmanAnglePitch: Number(nuevoDato.KalmanAnglePitch) || 0,
      };

      dispatch({ type: "ADD_DATA", payload: [datoFormateado] });
    };

    socket.on("datosCompleto", (data) => {
      handler(data);
    });

    return () => {
      socket.off("datosCompleto", handler);
    };
  }, []);

  const normalizeValue = (value: number): number => {
    return Math.min(Math.max(value, 1000), 2000);
  };

  const calculatePercentage = (value: number): number => {
    const normalized = normalizeValue(value);
    return ((normalized - 1000) / (2000 - 1000)) * 100;
  };

  const renderMotorQuadrant = (
    motorKey: string,
    label: string,
    position: string
  ) => {
    const lastData = data[data.length - 1];
    const rawValue = lastData?.[motorKey] ?? 1000;
    const value = normalizeValue(Number(rawValue));
    const percentage = calculatePercentage(value);

    return (
      <div
        style={{
          gridArea: position,
          backgroundColor: "#2a2a2a",
          borderRadius: "10px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
          border: `3px solid ${coloresMotores[motorKey]}`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <h3
          style={{
            color: "#fff",
            margin: "0 0 10px 0",
            fontSize: "1.2rem",
            zIndex: 2,
          }}
        >
          {label}
        </h3>

        {/* PWM Value Display */}
        <div
          style={{
            fontSize: "2rem",
            fontWeight: "bold",
            color: coloresMotores[motorKey],
            textShadow: `0 0 8px ${coloresMotores[motorKey]}80`,
            zIndex: 2,
            margin: "10px 0",
          }}
        >
          {value.toFixed(1)} μs
        </div>

        {/* Circular PWM Indicator */}
        <div
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            backgroundColor: "#1a1a1a",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "15px 0",
            zIndex: 2,
            border: `3px solid ${coloresMotores[motorKey]}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: `conic-gradient(${coloresMotores[motorKey]} ${percentage}%, transparent ${percentage}%)`,
              zIndex: 1,
            }}
          />
          <div
            style={{
              width: "90px",
              height: "90px",
              borderRadius: "50%",
              backgroundColor: "#2a2a2a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 3,
            }}
          >
            <span
              style={{ color: "#fff", fontSize: "1.5rem", fontWeight: "bold" }}
            >
              {percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderAnglesBars = () => {
    const lastData = data[data.length - 1];
    if (!lastData) return null;

    const angles = [
      {
        label: "Roll",
        value: Number(lastData.AngleRoll) || 0,
        color: "#F44336",
      },
      {
        label: "Pitch",
        value: Number(lastData.AnglePitch) || 0,
        color: "#4CAF50",
      },
      { label: "Yaw", value: Number(lastData.AngleYaw) || 0, color: "#2196F3" },
    ];

    return (
      <div style={{ width: "100%", margin: "0 auto 18px auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: "28px",
            width: "100%",
            maxWidth: 900,
          }}
        >
          {angles.map((a) => (
            <div
              key={a.label}
              style={{
                flex: 1,
                background:
                  "linear-gradient(135deg, #232323 80%, #222a3a 100%)",
                borderRadius: 16,
                padding: "18px 28px 14px 28px",
                minWidth: 120,
                maxWidth: 220,
                boxShadow: "0 4px 18px 0 rgba(0,0,0,0.18)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                border: `1.5px solid ${a.color}55`,
                fontFamily: "Segoe UI",
                transition: "box-shadow 0.2s",
              }}
            >
              <div
                style={{
                  color: a.color,
                  fontWeight: 700,
                  fontSize: 20,
                  marginBottom: 6,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  fontFamily: "Segoe UI",
                }}
              >
                {a.label}
              </div>
              <div
                style={{
                  color: "#fff",
                  fontSize: 38,
                  fontWeight: 800,
                  marginBottom: 8,
                  fontFamily: "Segoe UI",
                  letterSpacing: 0.5,
                  textShadow: `0 2px 8px ${a.color}33`,
                }}
              >
                {a.value.toFixed(2)}°
              </div>
              <div
                style={{
                  background: "#444",
                  borderRadius: 8,
                  height: 10,
                  width: "100%",
                  overflow: "hidden",
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    width: `${(Math.min(Math.abs(a.value), 180) / 180) * 100}%`,
                    background: `linear-gradient(90deg, ${a.color} 60%, #fff0 100%)`,
                    height: "100%",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const render3DTrajectory = () => {
    if (data.length < 2) return null;

    // Extrae los valores de cada ángulo
    const yaw = data.map((d) => Number(d.AngleYaw) || 0);
    const kalmanRoll = data.map((d) => Number(d.KalmanAngleRoll) || 0);
    const kalmanPitch = data.map((d) => Number(d.KalmanAnglePitch) || 0);

    return (
      <div style={{ maxWidth: 700, margin: "40px auto" }}>
        <h3 style={{ color: "#fff", textAlign: "center", marginBottom: 10 }}>
          Trayectoria 3D de Roll, Pitch y Yaw
        </h3>
        <Plot
          data={[
            {
              x: yaw, // o KalmanAngleYaw si lo tienes
              y: kalmanPitch,
              z: kalmanRoll,
              type: "scatter3d",
              mode: "lines+markers",
              marker: { color: "#8884d8", size: 3 },
              line: { color: "#2196F3", width: 4 },
              name: "Trayectoria",
            },
          ]}
          layout={{
            autosize: true,
            paper_bgcolor: "#1e1e1e",
            plot_bgcolor: "#1e1e1e",
            font: { color: "#fff" },
            scene: {
              xaxis: { title: { text: "Yaw (°)" }, color: "#2196F3" },
              yaxis: { title: { text: "Roll (°)" }, color: "#F44336" },
              zaxis: { title: { text: "Pitch (°)" }, color: "#4CAF50" },
              bgcolor: "#222",
            },
            margin: { l: 0, r: 0, b: 0, t: 30 },
          }}
          style={{ width: "100%", height: "400px" }}
          config={{ displayModeBar: false }}
        />
      </div>
    );
  };

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#1e1e1e",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <h1
        style={{
          textAlign: "center",
          marginBottom: "30px",
          color: "#fff",
        }}
      >
        Panel de Control de Motores PWM
      </h1>

      {/* SwitchControl arriba con ángulos dentro */}
      <div
        style={{
          width: "100%",
          maxWidth: 1000,
          margin: "0 auto 24px auto",
          backgroundColor: "#2a2a2a",
          borderRadius: "10px",
          padding: "20px 0 10px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
        }}
      >
        <h3
          style={{
            color: "#fff",
            marginBottom: "12px",
            fontSize: "1.5rem",
          }}
        >
          Modo de Conmutación
        </h3>
        <SwitchControl />
        {/* Ángulos en una sola fila dentro del bloque */}
        {renderAnglesBars()}
      </div>

      {/* Grid de motores */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gridTemplateAreas: `
          "motor4 motor1"
          "motor3 motor2"
        `,
          gap: "20px",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        {renderMotorQuadrant(
          "MotorInput4",
          "Motor Delantero Izquierdo",
          "motor4"
        )}
        {renderMotorQuadrant(
          "MotorInput1",
          "Motor Delantero Derecho",
          "motor1"
        )}
        {renderMotorQuadrant(
          "MotorInput3",
          "Motor Trasero Izquierdo",
          "motor3"
        )}
        {renderMotorQuadrant("MotorInput2", "Motor Trasero Derecho", "motor2")}
      </div>
      {/* Renderizar la trayectoria 3D */}
      {render3DTrajectory()}
    </div>
  );
};

export default MotorDashboard;
