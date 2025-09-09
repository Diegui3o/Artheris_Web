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
      COLS.angle_roll_est || 'KalmanAngleRoll as angle_roll_est',
      COLS.angle_pitch_est || 'KalmanAnglePitch as angle_pitch_est',
      COLS.angle_roll || 'AngleRoll as angle_roll',
      COLS.angle_pitch || 'AnglePitch as angle_pitch',
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
      COLS.error_phi || 'error_phi',
      COLS.error_theta || 'error_theta',
      COLS.input_roll,
      COLS.input_pitch,
      COLS.input_yaw,
      COLS.input_throttle || 'InputThrottle as input_throttle',
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
      '0 as packet_received',
      'CAST(NULL AS DOUBLE) as latency_ms',
      'CAST(NULL AS DOUBLE) as ref_roll',
      'CAST(NULL AS DOUBLE) as ref_pitch'
    ].filter(Boolean);  // Elimina valores falsy

    // Obtener columnas de la tabla
    const tableCols = await getTableColumns(TABLE_SENSOR_DATA);
    
    // Filtrar columnas que no existen en la tabla
    const validCols = cols.filter(col => {
      // Extraer el nombre de la columna (eliminando ' as alias' si existe)
      const colName = col.split(' as ')[0].trim();
      return tableCols.includes(colName);
    });

    if (validCols.length === 0) {
      throw new Error("No valid columns found for export");
    }

    const sql = `
      SELECT ${validCols.join(",\n             ")}
      FROM ${TABLE_SENSOR_DATA}
      WHERE ${COLS.flight_id} = '${flightId}'
      ORDER BY ${COLS.timestamp} ASC
    `;

    console.log(`[${new Date().toISOString()}] Exporting flight ${flightId} data...`);
    
    // Ejecutar la consulta
    const result = await questdbExec(sql);

    if (!result || !result.dataset || result.dataset.length === 0) {
      throw new Error(`No data found for flight ${flightId}`);
    }

    // Obtener los nombres de las columnas del resultado
    const columns = result.columns.map(col => col.name);
    
    // Crear el contenido CSV con manejo de valores nulos y comillas
    const csvContent = [
      columns.join(","),
      ...result.dataset.map(row => 
        row.map(cell => 
          cell === null || cell === undefined ? '' : 
          `"${String(cell).replace(/"/g, '""')}"`
        ).join(",")
      )
    ].join("\n");

    // Generar ruta del archivo
    const filename = `flight_${flightId}.csv`;
    const filePath = path.join(outputDir, filename);

    // Escribir el archivo
    fs.writeFileSync(filePath, csvContent, "utf8");
    
    console.log(`[${new Date().toISOString()}] Exported ${result.dataset.length} rows to ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error exporting flight ${flightId}:`, error);
    throw error; // Re-lanzar para manejo de errores en el llamador
  }
}
