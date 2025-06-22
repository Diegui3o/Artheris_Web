import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Card, CardContent } from "../components/ui/Card"; // Corrected import path
import "./AnglesDisplay.css"; // Import the CSS file for neon styling

const DroneAngles = () => {
  const [angles, setAngles] = useState<{
    roll: number;
    pitch: number;
    yaw: number;
    RateRoll: number;
    RatePitch: number;
    RateYaw: number;
    AccX: number;
    AccY: number;
    AccZ: number;
    KalmanAngleRoll: number;
    KalmanAnglePitch: number;
    MotorInput1: number;
    MotorInput2: number;
    MotorInput3: number;
    MotorInput4: number;
    distancia?: number;
    modo: number;
    InputThrottle: number;
    InputRoll: number;
    InputPitch: number;
    InputYaw: number;
    Altura: number;
    tau_x: number;
    tau_y: number;
    tau_z: number;
    error_phi: number;
    error_theta: number;
    AngleRoll?: number;
    AnglePitch?: number;
    AngleYaw?: number;
  }>({
    roll: 0,
    pitch: 0,
    yaw: 0,
    RateRoll: 0,
    RatePitch: 0,
    RateYaw: 0,
    AccX: 0,
    AccY: 0,
    AccZ: 0,
    KalmanAngleRoll: 0,
    KalmanAnglePitch: 0,
    MotorInput1: 0,
    MotorInput2: 0,
    MotorInput3: 0,
    MotorInput4: 0,
    distancia: 0,
    modo: 0,
    InputThrottle: 0,
    InputRoll: 0,
    InputPitch: 0,
    InputYaw: 0,
    Altura: 0,
    tau_x: 0,
    tau_y: 0,
    tau_z: 0,
    error_phi: 0,
    error_theta: 0,
  });

  useEffect(() => {
    const socket = io("http://localhost:3002");

    socket.on("angles", (data) => {
      //console.log("📡 Datos recibidos:", data);
      setAngles((prevAngles) => ({
        ...prevAngles,
        roll: data?.roll ?? prevAngles.roll, // Cambiado a 'roll'
        pitch: data?.pitch ?? prevAngles.pitch, // Cambiado a 'pitch'
        yaw: data?.yaw ?? prevAngles.yaw,
        RateRoll: data?.RateRoll ?? prevAngles.RateRoll,
        RatePitch: data?.RatePitch ?? prevAngles.RatePitch,
        RateYaw: data?.RateYaw ?? prevAngles.RateYaw,
        AccX: data?.AccX ?? prevAngles.AccX,
        AccY: data?.AccY ?? prevAngles.AccY,
        AccZ: data?.AccZ ?? prevAngles.AccZ,
        KalmanAngleRoll: data?.KalmanAngleRoll ?? prevAngles.KalmanAngleRoll,
        KalmanAnglePitch: data?.KalmanAnglePitch ?? prevAngles.KalmanAnglePitch,
        MotorInput1: data?.MotorInput1 ?? prevAngles.MotorInput1,
        MotorInput2: data?.MotorInput2 ?? prevAngles.MotorInput2,
        MotorInput3: data?.MotorInput3 ?? prevAngles.MotorInput3,
        MotorInput4: data?.MotorInput4 ?? prevAngles.MotorInput4,
        distancia: data?.distancia ?? prevAngles.distancia,
        modo: data?.modo ?? prevAngles.modo,
        InputThrottle: data?.InputThrottle ?? prevAngles.InputThrottle,
        InputRoll: data?.InputRoll ?? prevAngles.InputRoll,
        InputPitch: data?.InputPitch ?? prevAngles.InputPitch,
        InputYaw: data?.InputYaw ?? prevAngles.InputYaw,
        Altura: data?.Altura ?? prevAngles.Altura,
        tau_x: data?.tau_x ?? prevAngles.tau_x,
        tau_y: data?.tau_y ?? prevAngles.tau_y,
        tau_z: data?.tau_z ?? prevAngles.tau_z,
        error_phi: data?.error_phi ?? prevAngles.error_phi,
        error_theta: data?.error_theta ?? prevAngles.error_theta,
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
    title,
    children,
  }) => (
    <div className="section">
      <h3 className="section-title">{title}</h3>
      <div className="section-content">{children}</div>
    </div>
  );

  const Field: React.FC<{ label: string; value: number | undefined }> = ({
    label,
    value,
  }) => (
    <p className="label-text">
      {label}: <span className="value-text">{(value ?? 0).toFixed(3)}</span>
    </p>
  );

  return (
    <Card className="p-4 shadow-lg rounded-lg bg-black neon-card">
      <CardContent>
        <h2 className="neon-text">Drone Telemetría</h2>

        <Section title="Ángulos">
          <p className="label-text">
            Roll: <span className="value-text">{angles.roll.toFixed(3)}</span>
          </p>
          <p className="label-text">
            Pitch: <span className="value-text">{angles.pitch.toFixed(3)}</span>
          </p>
          <p className="label-text">
            Yaw: <span className="value-text">{angles.yaw.toFixed(3)}</span>
          </p>
        </Section>

        <Section title="Kalman">
          <p className="label-text">
            KalmanAngleRoll:{" "}
            <span className="value-text">
              {angles.KalmanAngleRoll.toFixed(3)}
            </span>
          </p>
          <p className="label-text">
            KalmanAnglePitch:{" "}
            <span className="value-text">
              {angles.KalmanAnglePitch.toFixed(3)}
            </span>
          </p>
        </Section>

        <Section title="Velocidades Angulares">
          <p className="label-text">
            Rate Roll:{" "}
            <span className="value-text">{angles.RateRoll.toFixed(3)}</span>
          </p>
          <p className="label-text">
            Rate Pitch:{" "}
            <span className="value-text">{angles.RatePitch.toFixed(3)}</span>
          </p>
          <p className="label-text">
            Rate Yaw:{" "}
            <span className="value-text">{angles.RateYaw.toFixed(3)}</span>
          </p>
        </Section>

        <Section title="Errores y Torques">
          <Field label="Error phi" value={angles.error_phi} />
          <Field label="Error theta" value={angles.error_theta} />
          <Field label="Tau X" value={angles.tau_x} />
          <Field label="Tau Y" value={angles.tau_y} />
          <Field label="Tau Z" value={angles.tau_z} />
        </Section>

        <Section title="Entradas de Control">
          <Field label="InputThrottle" value={angles.InputThrottle} />
          <Field label="InputRoll" value={angles.InputRoll} />
          <Field label="InputPitch" value={angles.InputPitch} />
          <Field label="InputYaw" value={angles.InputYaw} />
        </Section>

        <Section title="Motores">
          <Field label="Motor 1" value={angles.MotorInput1} />
          <Field label="Motor 2" value={angles.MotorInput2} />
          <Field label="Motor 3" value={angles.MotorInput3} />
          <Field label="Motor 4" value={angles.MotorInput4} />
        </Section>

        <Section title="Otros">
          <Field label="Altura" value={angles.Altura} />
          <Field label="Modo" value={angles.modo} />
        </Section>
      </CardContent>
    </Card>
  );
};

export default DroneAngles;
