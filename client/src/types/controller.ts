export type ControllerType = "pid" | "lqr" | "custom";

/* ---------- PID v2 (cascada opcional) ----------- */
export type PIDAxisSimple = {
  kind: "simple";
  kp: number; ki: number; kd: number;
  i_limit?: number;     // clamp a la integral
  d_cut_hz?: number;    // filtro derivada (LPF)
};

export type PIDAxisRate = {
  kind: "rate";
  kp: number; ki: number; kd: number;
  i_limit?: number;
  d_cut_hz?: number;
};

export type PIDAxisCascade = {
  kind: "cascade";
  angle: { kp: number; ki: number; kd?: number };    // suele ser PI o PD suave
  rate:  { kp: number; ki: number; kd: number;
           i_limit?: number; d_cut_hz?: number };
};

export type PIDAltitude = {
  enabled: boolean;
  pos: { kp: number; ki: number }; // control de altura (posición)
  vel: { kp: number; ki: number; kd: number; i_limit?: number; d_cut_hz?: number }; // velocidad vertical
};

export type PIDGains = {
  schema: "v2";
  roll:  PIDAxisSimple | PIDAxisCascade;
  pitch: PIDAxisSimple | PIDAxisCascade;
  // Yaw suele ir en rate. Si prefieres cascada, cambia a union con PIDAxisCascade.
  yaw:   PIDAxisRate | PIDAxisSimple;
  altitude?: PIDAltitude;
};

export type LQRParams = {
  Kc: Record<string, number>;
  Ki: Record<string, number>;
};

// types/controller.ts
export type CustomParams = {
  // Filtros/medición
  alpha?: number;                   // 0..1 (filtro complementario)
  beta?: number;                    // 0..1 (filtro complementario)
  complementary_alpha?: number;     // 0..1 (alias de alpha)
  lowpass_cut_hz?: number;          // Hz
  d_on_measurement?: boolean;

  // Notch opcional
  notch_f0_hz?: number;             // Hz (centro)
  notch_q?: number;                  // 0.1..50

  // Modelado/Feedforward
  ff_angle?: number;                 // deg → rate
  ff_rate?: number;                  // dps → output
  ff_thrust?: number;                // throttle → output

  // Shaping del setpoint
  setpoint_slew_dps?: number;        // límite velocidad setpoint
  setpoint_expo?: number;            // 0..1 (curva)

  // Anti-windup y límites
  i_limit?: number;                  // clamp de integral
  aw_backcalc_k?: number;            // back-calc gain (0..1)
  output_limit?: number;             // clamp final (abs)

  // Deadband / zonas muertas
  stick_deadband?: number;           // 0..1
  rate_deadband_dps?: number;        // dps

  // Mixer / motor
  motor_min?: number;                // 0..1
  motor_max?: number;                // 0..1
  hover_throttle?: number;           // 0..1

  // Seguridad
  failsafe_throttle?: number;        // 0..1
  disarm_on_flip?: boolean;

  // Libre para extensiones
  notes?: string;
};


export type ControllerConfig =
  | { type: "pid"; params: PIDGains }
  | { type: "lqr"; params: LQRParams }
  | { type: "custom"; params: CustomParams };

/* ---------- Defaults conservadores (seguros para empezar) ---------- */
export const defaultPID: PIDGains = {
  schema: "v2",
  roll: {
    kind: "cascade",
    angle: { kp: 2.0, ki: 0.00 },       // lazo externo (ángulo)
    rate:  { kp: 0.12, ki: 0.05, kd: 0.003, i_limit: 0.3, d_cut_hz: 60 }, // interno
  },
  pitch: {
    kind: "cascade",
    angle: { kp: 2.0, ki: 0.00 },
    rate:  { kp: 0.12, ki: 0.05, kd: 0.003, i_limit: 0.3, d_cut_hz: 60 },
  },
  yaw: {
    kind: "rate",
    kp: 0.10, ki: 0.05, kd: 0.0, i_limit: 0.3, d_cut_hz: 60,
  },
  altitude: {
    enabled: false,
    pos: { kp: 1.0,  ki: 0.01 },
    vel: { kp: 0.20, ki: 0.10, kd: 0.01, i_limit: 0.4, d_cut_hz: 30 },
  },
};

export const defaultLQR: LQRParams = {
  Kc: {
    "Kc_at[0][0]": 2.1, "Kc_at[1][1]": 1.92, "Kc_at[2][2]": 5.3,
    "Kc_at[0][3]": 0.58, "Kc_at[1][4]": 0.38, "Kc_at[2][5]": 1.6,
  },
  Ki: { "Ki_at[0][0]": 0.04, "Ki_at[1][1]": 0.09, "Ki_at[2][2]": 0.01 },
};

export const defaultCustom: CustomParams = { alpha: 0.5, beta: 0.1 };
