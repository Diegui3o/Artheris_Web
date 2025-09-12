import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TMP_DIR = path.join(os.tmpdir(), "artheris-flight-tmp");
import fs from "fs";
try {
  fs.mkdirSync(TMP_DIR, { recursive: true });
} catch {}
export const QUESTDB_HTTP_URL =
  process.env.QUESTDB_HTTP_URL || "http://localhost:9000";

// === Tablas/columnas reales según tu insertSensorData ===
export const TABLE_FLIGHTS = process.env.TABLE_FLIGHTS || "flights";
export const TABLE_SENSOR_DATA = process.env.TABLE_SENSOR_DATA || "sensor_data";

export const COLS = {
  // flights
  flight_id: "flight_id",
  start_time: "start_time",
  end_time: "end_time",

  // sensor_data
  timestamp: "timestamp",
  angle_roll_est: "angle_roll_est",
  angle_pitch_est: "angle_pitch_est",
  angle_roll: "angle_roll",
  angle_pitch: "angle_pitch",
  angle_yaw: "angle_yaw",
  gyro_rate_roll: "gyro_rate_roll",
  gyro_rate_pitch: "gyro_rate_pitch",
  gyro_rate_yaw: "gyro_rate_yaw",
  acc_x: "acc_x",
  acc_y: "acc_y",
  acc_z: "acc_z",
  tau_x: "tau_x",
  tau_y: "tau_y",
  tau_z: "tau_z",
  error_phi: "error_phi",
  error_theta: "error_theta",
  input_roll: "input_roll",
  input_pitch: "input_pitch",
  input_yaw: "input_yaw",
  input_throttle: "input_throttle",
  motor_1: "motor_1",
  motor_2: "motor_2",
  motor_3: "motor_3",
  motor_4: "motor_4",
  altura: "altura",
  flight_mode: "flight_mode",
  device_id: "device_id",
  roll: "roll",
  pitch: "pitch",
  yaw: "yaw",
  // clave foránea
  flight_id_fk: "flight_id",
};

export const CSV_DELIM = ",";

// Python
export const PYTHON_BIN = process.env.PYTHON_BIN || "python";
export const PY_METRICS = path.join(__dirname, "py", "metrics.py");
export const PY_COMPARE = path.join(__dirname, "py", "kalman_compare.py");
