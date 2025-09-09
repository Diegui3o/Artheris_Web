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

/** Exporta todo el sensor_data del flightId a CSV y devuelve la ruta. */
export async function exportFlightToCSV(flightId) {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Define the columns we want to select using COLS constants
  const cols = [
    COLS.timestamp,
    COLS.flight_id,
    COLS.angle_roll_est,
    COLS.angle_pitch_est,
    COLS.angle_roll,
    COLS.angle_pitch,
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
    COLS.error_phi,
    COLS.error_theta,
    COLS.input_roll,
    COLS.input_pitch,
    COLS.input_yaw,
    COLS.input_throttle,
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
  ];

  // Log all columns being used for debugging
  console.log("Export columns:", cols);

  // Ensure we have columns to select
  if (!cols.length) {
    throw new Error("No columns defined for export");
  }

  // Get table columns first
  const tableCols = await getTableColumns(TABLE_SENSOR_DATA);

  // Filter out any undefined, null, or empty string columns and log them for debugging
  let validCols = cols.filter((col, index) => {
    if (col === undefined || col === null || col === "") {
      console.warn(`Warning: Found invalid column at index ${index}:`, col);
      return false;
    }
    return true;
  });

  // Filter out columns that don't exist in the table
  validCols = validCols.filter((col) => tableCols.includes(col));

  if (validCols.length !== cols.length) {
    console.warn("Some columns were filtered out. Original columns:", cols);
    console.warn("Filtered columns:", validCols);
  }

  const columns = validCols.map((col) => `"${col}"`).join(", ");
  const sql = `
  SELECT ${columns}
  FROM "${TABLE_SENSOR_DATA}"
  WHERE "flight_id" = '${flightId.replace(/'/g, "''")}'
  ORDER BY "timestamp" ASC
`;
  const res = await questdbExec(sql);

  const csvPath = path.join(TMP_DIR, `flight_${flightId}.csv`);
  const header = validCols.join(CSV_DELIM) + "\n"; // <--- aquí validCols

  // Mapear índices usando res.columns
  const colIndices = {};
  res.columns.forEach((col, index) => {
    colIndices[col.name] = index;
  });

  const lines = [];
  for (const row of res.dataset || []) {
    const values = validCols.map((colName) => {
      // <--- y aquí validCols
      const colIndex = colIndices[colName];
      if (colIndex === undefined) return "";
      const value = row[colIndex];
      if (value === null || value === undefined) return "";
      const strValue = String(value);
      return strValue.includes(CSV_DELIM) ||
        strValue.includes("\n") ||
        strValue.includes('"')
        ? `"${strValue.replace(/"/g, '""')}"`
        : strValue;
    });
    lines.push(values.join(CSV_DELIM));
  }

  await fs.promises.writeFile(csvPath, header + lines.join("\n"), "utf8");
  return csvPath;
}
