// src/data/export_csv.js
import fs from "fs";
import path from "path";
import { questdbExec } from "./questdb_http.js";
import {
  TABLE_SENSOR_DATA,
  TABLE_FLIGHTS,
  COLS,
  TMP_DIR,
  CSV_DELIM,
} from "./config.js";
import { pool } from "../server/questdb.js";

async function getTableColumns(table) {
  const r = await pool.query(`SELECT * FROM ${table} LIMIT 0`);
  return r.fields?.map((f) => f.name) || r.columns?.map((c) => c.name) || [];
}

export async function getLatestFlightId() {
  const sql = `
    SELECT ${COLS.flight_id}, end_time, ${COLS.start_time}
    FROM ${TABLE_FLIGHTS}
    WHERE end_time IS NOT NULL
    ORDER BY end_time DESC, ${COLS.start_time} DESC
    LIMIT 1
  `;
  const res = await questdbExec(sql);
  if (!res.dataset || !res.dataset.length) return null;
  const idx = res.columns.findIndex((c) => c.name === COLS.flight_id);
  return idx >= 0 ? res.dataset[0][idx] : null;
}

/**
 * Exporta los datos del vuelo a un archivo CSV y devuelve la ruta del archivo.
 * @param {string} flightId - ID del vuelo a exportar
 * @param {string} [outputDir] - Directorio de salida opcional (por defecto usa TMP_DIR)
 * @returns {Promise<string>} Ruta al archivo CSV generado
 */
export async function exportFlightToCSV(flightId, outputDir = TMP_DIR) {
  try {
    // Asegurarse de que el directorio de salida exista
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Columnas a exportar
    const cols = [
      COLS.timestamp,
      COLS.flight_id,
      COLS.angle_roll_est || "KalmanAngleRoll as angle_roll_est",
      COLS.angle_pitch_est || "KalmanAnglePitch as angle_pitch_est",
      COLS.angle_roll || "AngleRoll as angle_roll",
      COLS.angle_pitch || "AnglePitch as angle_pitch",
      COLS.angle_yaw,
      COLS.gyro_rate_roll,
      COLS.gyro_rate_pitch,
      COLS.gyro_rate_yaw,
      COLS.acc_x,
      COLS.acc_y,
      COLS.acc_z,
      COLS.tau_x,
      COLS.tau_y,
      COLS.tau_z,
      COLS.error_phi || "error_phi",
      COLS.error_theta || "error_theta",
      COLS.input_roll,
      COLS.input_pitch,
      COLS.input_yaw,
      COLS.input_throttle || "InputThrottle as input_throttle",
      COLS.motor_1,
      COLS.motor_2,
      COLS.motor_3,
      COLS.motor_4,
      COLS.altura,
      COLS.flight_mode,
      COLS.device_id,
      COLS.roll,
      COLS.pitch,
      COLS.yaw,
      // Valores por defecto para columnas opcionales
      "0 as packet_received",
      "CAST(NULL AS DOUBLE) as latency_ms",
      "CAST(NULL AS DOUBLE) as ref_roll",
      "CAST(NULL AS DOUBLE) as ref_pitch",
    ].filter(Boolean); // Elimina valores falsy

    const tableCols = await getTableColumns(TABLE_SENSOR_DATA);

    // Helper functions
    const hasCol = (name) => tableCols.includes(name);
    const baseName = (s) => {
      if (!s) return "";
      const m = String(s).split(/\s+as\s+/i);
      return m[0].trim().replace(/["`']/g, "");
    };

    // Column name candidates
    const REF_ROLL_CANDS = ["ref_roll", "RefRoll", "reference_roll"].filter(
      Boolean
    );
    const REF_PITCH_CANDS = ["ref_pitch", "RefPitch", "reference_pitch"].filter(
      Boolean
    );
    const INPUT_ROLL_NAMES = [COLS.input_roll, "InputRoll", "input_roll"]
      .filter(Boolean)
      .map(baseName);
    const INPUT_PITCH_NAMES = [COLS.input_pitch, "InputPitch", "input_pitch"]
      .filter(Boolean)
      .map(baseName);

    // Check if input columns exist
    const hasInputRoll = INPUT_ROLL_NAMES.some(hasCol);
    const hasInputPitch = INPUT_PITCH_NAMES.some(hasCol);

    // Helper to pick first existing column from candidates
    const pickExisting = (cands) => cands.find((c) => c && hasCol(c));

    // Resolve reference expressions once
    const refRollExpr = (() => {
      const col = pickExisting(REF_ROLL_CANDS);
      if (col) return `${col} as ref_roll`;
      const inCol = pickExisting(INPUT_ROLL_NAMES);
      if (inCol) return `${inCol} as ref_roll`;
      return `0.0 as ref_roll`;
    })();

    const refPitchExpr = (() => {
      const col = pickExisting(REF_PITCH_CANDS);
      if (col) return `${col} as ref_pitch`;
      const inCol = pickExisting(INPUT_PITCH_NAMES);
      if (inCol) return `${inCol} as ref_pitch`;
      return `0.0 as ref_pitch`;
    })();

    // Build SELECT clauses
    const selectIfExists = [
      COLS.timestamp,
      COLS.flight_id,
      // si te vienen con fallback tipo 'KalmanAngleRoll as angle_roll_est', usamos el baseName para chequear
      baseName(COLS.angle_roll_est) && hasCol(baseName(COLS.angle_roll_est))
        ? `${baseName(COLS.angle_roll_est)} as angle_roll_est`
        : null,
      baseName(COLS.angle_pitch_est) && hasCol(baseName(COLS.angle_pitch_est))
        ? `${baseName(COLS.angle_pitch_est)} as angle_pitch_est`
        : null,
      baseName(COLS.angle_roll) && hasCol(baseName(COLS.angle_roll))
        ? `${baseName(COLS.angle_roll)} as angle_roll`
        : null,
      baseName(COLS.angle_pitch) && hasCol(baseName(COLS.angle_pitch))
        ? `${baseName(COLS.angle_pitch)} as angle_pitch`
        : null,
      COLS.angle_yaw && hasCol(baseName(COLS.angle_yaw))
        ? COLS.angle_yaw
        : null,
      COLS.gyro_rate_roll && hasCol(baseName(COLS.gyro_rate_roll))
        ? COLS.gyro_rate_roll
        : null,
      COLS.gyro_rate_pitch && hasCol(baseName(COLS.gyro_rate_pitch))
        ? COLS.gyro_rate_pitch
        : null,
      COLS.gyro_rate_yaw && hasCol(baseName(COLS.gyro_rate_yaw))
        ? COLS.gyro_rate_yaw
        : null,
      COLS.acc_x && hasCol(baseName(COLS.acc_x)) ? COLS.acc_x : null,
      COLS.acc_y && hasCol(baseName(COLS.acc_y)) ? COLS.acc_y : null,
      COLS.acc_z && hasCol(baseName(COLS.acc_z)) ? COLS.acc_z : null,
      COLS.tau_x && hasCol(baseName(COLS.tau_x)) ? COLS.tau_x : null,
      COLS.tau_y && hasCol(baseName(COLS.tau_y)) ? COLS.tau_y : null,
      COLS.tau_z && hasCol(baseName(COLS.tau_z)) ? COLS.tau_z : null,
      COLS.error_phi && hasCol(baseName(COLS.error_phi))
        ? COLS.error_phi
        : null,
      COLS.error_theta && hasCol(baseName(COLS.error_theta))
        ? COLS.error_theta
        : null,
      COLS.input_yaw && hasCol(baseName(COLS.input_yaw))
        ? COLS.input_yaw
        : null,
      COLS.input_throttle && hasCol(baseName(COLS.input_throttle))
        ? COLS.input_throttle
        : null,
      COLS.motor_1 && hasCol(baseName(COLS.motor_1)) ? COLS.motor_1 : null,
      COLS.motor_2 && hasCol(baseName(COLS.motor_2)) ? COLS.motor_2 : null,
      COLS.motor_3 && hasCol(baseName(COLS.motor_3)) ? COLS.motor_3 : null,
      COLS.motor_4 && hasCol(baseName(COLS.motor_4)) ? COLS.motor_4 : null,
      COLS.altura && hasCol(baseName(COLS.altura)) ? COLS.altura : null,
      COLS.flight_mode && hasCol(baseName(COLS.flight_mode))
        ? COLS.flight_mode
        : null,
      COLS.device_id && hasCol(baseName(COLS.device_id))
        ? COLS.device_id
        : null,
      COLS.roll && hasCol(baseName(COLS.roll)) ? COLS.roll : null,
      COLS.pitch && hasCol(baseName(COLS.pitch)) ? COLS.pitch : null,
      COLS.yaw && hasCol(baseName(COLS.yaw)) ? COLS.yaw : null,
    ].filter(Boolean);

    const selectAlways = [
      refRollExpr,
      refPitchExpr,
      `0 as packet_received`,
      `CAST(NULL AS DOUBLE) as latency_ms`,
    ];

    // Combina ambas listas
    const selectClauses = [...selectIfExists, ...selectAlways];

    if (selectClauses.length === 0) {
      throw new Error("No valid columns found for export");
    }

    const sql = `
  SELECT ${selectClauses.join(",\n         ")}
  FROM ${TABLE_SENSOR_DATA}
  WHERE ${COLS.flight_id} = '${flightId}'
  ORDER BY ${COLS.timestamp} ASC
`;

    // Ejecutar la consulta
    const result = await questdbExec(sql);

    if (!result.dataset || result.dataset.length === 0) {
      throw new Error(`No data found for flight ${flightId}`);
    }

    // Crear el nombre del archivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `flight_${flightId}_${timestamp}.csv`;
    const filepath = path.join(outputDir, filename);

    // Escribir el encabezado
    const header =
      result.columns.map((col) => `"${col.name}"`).join(CSV_DELIM) + "\n";

    // Escribir los datos
    const rows = result.dataset
      .map((row) =>
        row
          .map(
            (field) =>
              `"${field !== null ? String(field).replace(/"/g, '""') : ""}"`
          )
          .join(CSV_DELIM)
      )
      .join("\n");

    // Escribir todo al archivo
    fs.writeFileSync(filepath, header + rows);

    console.log(`Exported ${result.dataset.length} rows to ${filepath}`);
    return filepath;
  } catch (error) {
    console.error("Error exporting flight to CSV:", error);
    throw error;
  }
}
