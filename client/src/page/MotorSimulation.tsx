import { useEffect, useReducer } from "react";
import { io } from "socket.io-client";
import SwitchControl from "./switchmode";

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
      return newData.slice(-1); // Solo mantener el último dato
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
      };

      dispatch({ type: "ADD_DATA", payload: [datoFormateado] });
    };

    socket.on("datosCompleto", handler);

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
          border: `2px solid ${coloresMotores[motorKey]}`,
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
          gridTemplateAreas: `
          "motor4 motor1"
          "motor3 motor2"
          "switch switch"
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

        {/* SwitchControl Component */}
        <div
          style={{
            gridArea: "switch",
            backgroundColor: "#2a2a2a",
            borderRadius: "10px",
            padding: "20px",
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
              marginBottom: "20px",
              fontSize: "1.5rem",
            }}
          >
            Modo de Conmutación
          </h3>
          <SwitchControl />
        </div>
      </div>
    </div>
  );
};

export default MotorDashboard;
