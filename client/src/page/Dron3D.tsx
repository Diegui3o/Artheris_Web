import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { useEffect, useState, useRef } from "react";
import * as THREE from "three";
import { io } from "socket.io-client";

function Drone({
  kalmanAngles,
  anglesData,
}: {
  anglesData: { yaw: number; Yaw?: number };
  kalmanAngles: { roll: number; pitch: number };
}) {
  const droneRef = useRef<THREE.Group>(null);
  const obj = useLoader(OBJLoader, "/src/models/base(2).obj");

  useFrame(() => {
    if (droneRef.current) {
      // Invertir el signo de yaw para corregir la dirección
      droneRef.current.rotation.set(
        kalmanAngles.pitch, // X: Pitch
        -anglesData.yaw, // Y: Yaw invertido
        kalmanAngles.roll // Z: Roll
      );
    }
  });

  return (
    <primitive ref={droneRef} object={obj} scale={1} position={[0, 0, 0]} />
  );
}

export default function Dron3D() {
  const [anglesData, setAnglesData] = useState({ yaw: 0, Yaw: 0 });
  const [kalmanAngles, setKalmanAngles] = useState({ roll: 0, pitch: 0 });

  useEffect(() => {
    const socket = io("http://localhost:3002");

    socket.on("angles", (data) => {
      setKalmanAngles({
        roll: THREE.MathUtils.degToRad(data?.KalmanAngleRoll ?? 0),
        pitch: THREE.MathUtils.degToRad(data?.KalmanAnglePitch ?? 0),
      });
      // Usar el primer valor disponible: Yaw, yaw, AngleYaw
      const yawValue = data?.Yaw ?? data?.yaw ?? data?.AngleYaw ?? 0;
      setAnglesData({
        yaw: THREE.MathUtils.degToRad(yawValue),
        Yaw: yawValue,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "70vw", height: "70vh" }}>
      {/* 🔷 Cuadro flotante con ángulos Kalman */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          backgroundColor: "rgba(0, 0, 0, 0.34)",
          color: "#0AC4ff",
          padding: "15px",
          borderRadius: "10px",
          fontFamily: "monospace",
          boxShadow: "0 4px 8px rgba(0, 0, 0, 0.23)",
        }}
      >
        <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>
          Kalman Roll: {THREE.MathUtils.radToDeg(kalmanAngles.roll).toFixed(2)}°
        </p>
        <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>
          Kalman Pitch:{" "}
          {THREE.MathUtils.radToDeg(kalmanAngles.pitch).toFixed(2)}°
        </p>
        <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>
          Yaw: {anglesData.Yaw?.toFixed(2)}°
        </p>
      </div>

      {/* 🛸 Escena 3D */}
      <Canvas
        camera={{
          position: [0, 1, 2.9],
          fov: 50,
        }}
      >
        <Drone kalmanAngles={kalmanAngles} anglesData={anglesData} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} castShadow intensity={1.5} />
        <OrbitControls />
      </Canvas>
    </div>
  );
}
