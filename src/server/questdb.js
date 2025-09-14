import pg from "pg";
import { v4 as uuidv4 } from "uuid";

function createPool() {
  return new pg.Pool({
    host: "localhost",
    port: 8812,
    user: "admin",
    password: "quest",
    database: "qdb",
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
    maxUses: 10000,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    max: 10,
  });
}

let pool = createPool();

pool
  .query("SELECT 1")
  .then(() => console.log("✅ Connection to QuestDB Established"))
  .catch((err) => {
    console.error("❌ Could not connect to QuestDB:", err.message);
  });

function safe(value) {
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number")
    return Number.isFinite(value) ? Number(value.toFixed(3)) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return "NULL";
}

function formatWithPrecision(value, decimals = 3) {
  if (value === undefined || value === null || isNaN(value)) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number(value.toFixed(decimals));
  }
  return value;
}

function safeString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
function safeJSON(obj) {
  try {
    return safeString(JSON.stringify(obj));
  } catch {
    return "NULL";
  }
}
// Errores que justifican recrear el pool y reintentar
const RETRYABLE_NET = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ECONNABORTED",
]);
const RETRYABLE_PG = new Set(["57P01", "57P02", "08006", "08000"]);

export async function query(sql, params) {
  return runQuery(sql, params);
}

export async function runQuery(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    const code = err?.code;
    const msg = String(err?.message || "");
    const isTerminated = msg.includes("Connection terminated unexpectedly");
    const netErr = RETRYABLE_NET.has(code);
    const pgErr = RETRYABLE_PG.has(code);

    if (isTerminated || netErr || pgErr) {
      console.warn("[db] connection died, recreating pool and retrying once…", {
        code,
        msg,
      });
      try {
        await pool.end().catch(() => {});
      } catch {}
      pool = createPool();
      return await pool.query(sql, params);
    }
    throw err;
  }
}

setInterval(() => {
  runQuery("SELECT 1").catch((e) =>
    console.warn("[db] keepalive failed:", e.message)
  );
}, 60_000);

// Cierre limpio
async function shutdown() {
  try {
    await pool.end();
  } finally {
    process.exit(0);
  }
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

// Pool is already exported above
export async function saveControllerConfig({
  flightId,
  controllerType, // 'PID' | 'LQR' | 'CUSTOM'
  config, // objeto JS (PID/LQR/Custom)
  meta = {}, // {presetName, version, source:'ui'|'fw'...}
  ts = new Date().toISOString(),
}) {
  await ensureTableExists();
  const q = `
    INSERT INTO controller_config (timestamp, flight_id, controller_type, config, meta)
    VALUES (
      '${new Date(ts).toISOString()}',
      ${safeString(flightId)},
      ${safeString(controllerType)},
      ${safeJSON(config)},
      ${safeJSON(meta)}
    )
  `;
  await executeQueryWithRetry(q);
  console.log(
    `📝 controller_config saved for flight ${flightId} (${controllerType})`
  );
}

export async function createFlightWithController({
  controllerType,
  pid = null,
  lqr = null,
  custom = null,
  mass = null,
  armLength = null,
  meta = {},
}) {
  await ensureTableExists();

  // 🔧 Normaliza tipo a minúsculas
  const type = String(controllerType || "").toLowerCase(); // "pid" | "lqr" | "custom"

  const flightId = uuidv4();
  const startTime = new Date().toISOString();

  // Initialize Kc and Ki with null values
  let kc = {
    "Kc_at[0][0]": 0,
    "Kc_at[1][1]": 0,
    "Kc_at[2][2]": 0,
    "Kc_at[0][3]": 0,
    "Kc_at[1][4]": 0,
    "Kc_at[2][5]": 0,
  };
  let ki = {
    "Ki_at[0][0]": 0,
    "Ki_at[1][1]": 0,
    "Ki_at[2][2]": 0,
  };

  if (type === "lqr" && lqr && lqr.Kc && lqr.Ki) {
    // For LQR, use the provided Kc and Ki matrices
    kc = lqr.Kc;
    ki = lqr.Ki;
  } else if (type === "pid" && pid) {
    // For PID, map the PID parameters to Kc and Ki
    const { roll, pitch, yaw } = pid;

    // Helper to get rate kp/ki from PID axis
    const getRateParams = (axis) => {
      if (!axis) return { kp: 0, ki: 0 };
      if (axis.kind === "cascade" && axis.rate) {
        return { kp: axis.rate.kp || 0, ki: axis.rate.ki || 0 };
      }
      if (axis.kind === "rate" || axis.kind === "simple") {
        return { kp: axis.kp || 0, ki: axis.ki || 0 };
      }
      return { kp: 0, ki: 0 };
    };

    // Map roll PID to Kc/Ki
    const rollRate = getRateParams(roll);
    kc["Kc_at[0][0]"] = rollRate.kp;
    ki["Ki_at[0][0]"] = rollRate.ki;

    // Map pitch PID to Kc/Ki
    const pitchRate = getRateParams(pitch);
    kc["Kc_at[1][1]"] = pitchRate.kp;
    ki["Ki_at[1][1]"] = pitchRate.ki;

    // Map yaw PID to Kc (yaw typically doesn't have integral term)
    const yawRate = getRateParams(yaw);
    kc["Kc_at[2][2]"] = yawRate.kp;
    ki["Ki_at[2][2]"] = 0; // No integral term for yaw
  }

  const six = (x) => (typeof x === "number" ? Number(x.toFixed(6)) : x);
  const kc_array = [
    kc["Kc_at[0][0]"],
    kc["Kc_at[1][1]"],
    kc["Kc_at[2][2]"],
    kc["Kc_at[0][3]"],
    kc["Kc_at[1][4]"],
    kc["Kc_at[2][5]"],
  ];
  const ki_array = [ki["Ki_at[0][0]"], ki["Ki_at[1][1]"], ki["Ki_at[2][2]"]];
  const [kc_0_0, kc_1_1, kc_2_2, kc_0_3, kc_1_4, kc_2_5] = kc_array.map(six);
  const [ki_0_0, ki_1_1, ki_2_2] = ki_array.map(six);

  const insert = `
    INSERT INTO flights (
      flight_id, start_time, mass, arm_length,
      kc_0_0, kc_1_1, kc_2_2, kc_0_3, kc_1_4, kc_2_5,
      ki_0_0, ki_1_1, ki_2_2,
      controller_type
    ) VALUES (
      ${safeString(flightId)}, '${startTime}', ${safe(mass)}, ${safe(
    armLength
  )},
      ${safe(kc_0_0)}, ${safe(kc_1_1)}, ${safe(kc_2_2)},
      ${safe(kc_0_3)}, ${safe(kc_1_4)}, ${safe(kc_2_5)},
      ${safe(ki_0_0)}, ${safe(ki_1_1)}, ${safe(ki_2_2)},
      ${safeString(type)}
    )
  `;
  await executeQueryWithRetry(insert);

  const configObj =
    type === "pid"
      ? pid
      : type === "lqr"
      ? lqr
      : type === "custom"
      ? custom
      : null;

  await saveControllerConfig({
    flightId,
    controllerType: type,
    config: configObj,
    meta,
    ts: startTime,
  });

  return flightId;
}

export async function insertNewFlight(Kc, Ki, mass = null, armLength = null) {
  return await createFlightWithController({
    controllerType: "LQR",
    lqr: {
      Kc: {
        "Kc_at[0][0]": Kc[0],
        "Kc_at[1][1]": Kc[1],
        "Kc_at[2][2]": Kc[2],
        "Kc_at[0][3]": Kc[3],
        "Kc_at[1][4]": Kc[4],
        "Kc_at[2][5]": Kc[5],
      },
      Ki: {
        "Ki_at[0][0]": Ki[0],
        "Ki_at[1][1]": Ki[1],
        "Ki_at[2][2]": Ki[2],
      },
    },
    mass,
    armLength,
    meta: { source: "ui", note: "legacy insertNewFlight" },
  });
}

export async function getFlightData(flightId) {
  try {
    await ensureTableExists();

    const flightQ = `
      SELECT * FROM flights WHERE flight_id = ${safe(flightId)} LIMIT 1
    `;
    const flightR = await pool.query(flightQ);
    if (flightR.rows.length === 0) return null;

    // Última config
    const cfgQ = `
      SELECT controller_type, config, meta, timestamp
      FROM controller_config
      WHERE flight_id = ${safe(flightId)}
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    const cfgR = await pool.query(cfgQ);
    let cfg = null;
    if (cfgR.rows.length) {
      try {
        cfg = {
          controller_type: cfgR.rows[0].controller_type,
          meta: JSON.parse(cfgR.rows[0].meta || "{}"),
          config: JSON.parse(cfgR.rows[0].config || "{}"),
          timestamp: cfgR.rows[0].timestamp,
        };
      } catch {
        cfg = {
          controller_type: cfgR.rows[0].controller_type,
          raw: cfgR.rows[0].config,
        };
      }
    }

    // Muestras rápidas
    const sensorQ = `
      SELECT timestamp, angle_roll, angle_pitch, angle_yaw,
             acc_x, acc_y, acc_z, input_throttle
      FROM sensor_data
      WHERE flight_id = ${safe(flightId)}
      ORDER BY timestamp DESC
      LIMIT 10
    `;
    const sensorR = await pool.query(sensorQ);

    return {
      flight: flightR.rows[0],
      controller: cfg,
      sensorData: sensorR.rows,
    };
  } catch (err) {
    console.error("❌ getFlightData error:", err.message);
    return null;
  }
}

export async function executeQueryWithRetry(query, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await runQuery(query);
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Query failed (${i + 1}/${retries}):`, error.message);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function finalizeStaleFlights(idleMs = 5000) {
  // Umbral absoluto en ISO (UTC)
  const thresholdIso = new Date(Date.now() - idleMs).toISOString();

  const getStaleFlightsQuery = `
    SELECT f.flight_id
    FROM flights f
    LEFT JOIN (
      SELECT flight_id, max(timestamp) AS last_update
      FROM sensor_data
      GROUP BY flight_id
    ) s ON f.flight_id = s.flight_id
    WHERE f.end_time IS NULL
      AND (
        (s.last_update IS NOT NULL AND s.last_update < cast('${thresholdIso}' AS timestamp))
        OR (s.last_update IS NULL    AND f.start_time   < cast('${thresholdIso}' AS timestamp))
      )
  `;

  try {
    const { rows } = await pool.query(getStaleFlightsQuery);
    for (const { flight_id } of rows) {
      await pool.query(
        "UPDATE flights SET end_time = now() WHERE flight_id = $1 AND end_time IS NULL",
        [flight_id]
      );
    }
  } catch (e) {
    console.error(
      "finalizeStaleFlights error:",
      e.message,
      "\nQuery was:\n",
      getStaleFlightsQuery
    );
  }
}

export async function updateFlightEndTime(flightId) {
  const query = `
    UPDATE flights
    SET end_time = now()
    WHERE flight_id = $1
  `;

  try {
    await pool.query(query, [flightId]);
    console.log(`✅ Updated flight ${flightId} with end time`);
    return true;
  } catch (err) {
    console.error(`❌ Error updating flight end time:`, err);

    // If the error is about the status column, try without it
    if (err.message.includes("status")) {
      console.log("⚠️ Retrying without status update...");
      const fallbackQuery = `
           UPDATE flights 
           SET end_time = now()
           WHERE flight_id = $1
         `;
      try {
        await pool.query(fallbackQuery, [flightId]);
        console.log(
          `✅ Updated flight ${flightId} with end time (without status)`
        );
        return true;
      } catch (fallbackErr) {
        console.error(
          "❌ Failed to update flight end time with fallback query:",
          fallbackErr
        );
        return false;
      }
    }

    return false;
  }
}

export async function insertSensorData(sensor, flightId) {
  if (!sensor) {
    console.error("❌ No sensor data provided to insertSensorData");
    return;
  }
  if (!flightId) {
    console.error("❌ No flightId provided to insertSensorData");
    return;
  }

  console.log(`📡 Inserting sensor data for flight ${flightId}`);

  const safeWithPrecision = (value, decimals = 3) => {
    if (value === undefined || value === null || isNaN(value)) return "NULL";
    if (typeof value === "number") return Number(value.toFixed(decimals));
    return value;
  };

  const {
    // del ESP32
    timestamp = 0, // relativo, no es ISO
    AngleRoll,
    AnglePitch,
    AngleYaw,
    RateRoll = 0,
    RatePitch = 0,
    RateYaw = 0,
    AccX = 0,
    AccY = 0,
    AccZ = 0,
    tau_x = 0,
    tau_y = 0,
    tau_z = 0,
    KalmanAngleRoll = 0,
    KalmanAnglePitch = 0,
    error_phi = 0,
    error_theta = 0,
    InputRoll = 0,
    InputPitch = 0,
    InputYaw = 0,
    MotorInput1 = 0,
    MotorInput2 = 0,
    MotorInput3 = 0,
    MotorInput4 = 0,
    Altura = 0,
    modo = 0,
    id: deviceIdRaw = null,
    roll = 0,
    pitch = 0,
    yaw = 0,
    InputThrottle = 0,
    time: isoTime,
    innov_roll = null,
    S_roll = null,
    innov_pitch = null,
    S_pitch = null,
    P_roll = null,
    P_pitch = null,
  } = sensor || {};

  let tsExpr = "now()";
  if (typeof isoTime === "string" && !Number.isNaN(Date.parse(isoTime))) {
    tsExpr = `'${new Date(isoTime).toISOString()}'`;
  }

  // 2) device_id seguro (evita 'null' literal)
  const deviceId = deviceIdRaw ?? "unknown"; // si viene null → 'unknown'

  const query = `
      INSERT INTO sensor_data (
        timestamp, flight_id,
        angle_roll_est, angle_pitch_est, angle_yaw,
        gyro_rate_roll, gyro_rate_pitch, gyro_rate_yaw,
        acc_x, acc_y, acc_z,
        tau_x, tau_y, tau_z,
        angle_roll, angle_pitch,
        error_phi, error_theta,
        input_roll, input_pitch, input_yaw, input_throttle,
        motor_1, motor_2, motor_3, motor_4,
        altura,
        flight_mode,
        device_id,
        roll, pitch, yaw,
        innov_roll, S_roll, innov_pitch, S_pitch, P_roll, P_pitch
      ) VALUES (
    ${tsExpr}, '${flightId}',
        ${safeWithPrecision(KalmanAngleRoll)}, ${safeWithPrecision(
    KalmanAnglePitch
  )}, ${safeWithPrecision(AngleYaw)},
        ${safeWithPrecision(RateRoll)}, ${safeWithPrecision(
    RatePitch
  )}, ${safeWithPrecision(RateYaw)},
        ${safeWithPrecision(AccX)}, ${safeWithPrecision(
    AccY
  )}, ${safeWithPrecision(AccZ)},
        ${safeWithPrecision(tau_x)}, ${safeWithPrecision(
    tau_y
  )}, ${safeWithPrecision(tau_z)},
        ${safeWithPrecision(AngleRoll)}, ${safeWithPrecision(AnglePitch)},
        ${safeWithPrecision(error_phi)}, ${safeWithPrecision(error_theta)},
        ${safeWithPrecision(InputRoll)}, ${safeWithPrecision(
    InputPitch
  )}, ${safeWithPrecision(InputYaw)}, ${safeWithPrecision(InputThrottle)},
        ${safeWithPrecision(MotorInput1)}, ${safeWithPrecision(
    MotorInput2
  )}, ${safeWithPrecision(MotorInput3)}, ${safeWithPrecision(MotorInput4)},
        ${safeWithPrecision(Altura)},
        ${safeWithPrecision(modo)},
        ${safeString(deviceId)},
        ${safeWithPrecision(roll)}, ${safeWithPrecision(
    pitch
  )}, ${safeWithPrecision(yaw)},
        ${safeWithPrecision(innov_roll)}, ${safeWithPrecision(
    S_roll
  )}, ${safeWithPrecision(innov_pitch)}, ${safeWithPrecision(
    S_pitch
  )}, ${safeWithPrecision(P_roll)}, ${safeWithPrecision(P_pitch)}
      )
    `;

  try {
    // console.log('📝 Query:', query); // ← deja esto solo para depurar
    await executeQueryWithRetry(query);
    console.log(`✅ Successfully inserted sensor data for flight ${flightId}`);
  } catch (err) {
    console.error("❌ Error inserting sensor data:", err.message);
    console.error(
      "Sensor data that failed to insert:",
      JSON.stringify(sensor, null, 2)
    );
    throw err;
  }
}
export async function forceCloseFlight(flightId) {
  await pool.query(
    "UPDATE flights SET end_time = now() WHERE flight_id = $1 AND end_time IS NULL",
    [flightId]
  );
}
export async function insertControlState(modo, ledStatus, motorStatus) {
  const query = `
      INSERT INTO control_state (timestamp, modo, led_status, motor_status)
      VALUES (now(), ${safe(modo)}, ${safe(ledStatus)}, ${safe(motorStatus)})
    `;
  try {
    await executeQueryWithRetry(query);
    return true;
  } catch (err) {
    console.error("❌ Insert error:", err.message);
  }
}

export async function printLastSensorData(n = 10, returnRows = false) {
  try {
    // Ensure table exists before querying
    await ensureTableExists();

    const result = await pool.query(
      `SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ${n}`
    );
    if (returnRows) return result.rows;
    console.log("Latest sensor_data records:");
    console.table(result.rows);
  } catch (err) {
    console.error("❌ Error when consulting sensor_data:", err.message);
    if (returnRows) return [];
  }
}
export async function getLatestControllerSnapshot(flightId) {
  const q = `
    SELECT controller_type, config, meta, timestamp
    FROM controller_config
    WHERE flight_id = ${safeString(flightId)}
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  const r = await pool.query(q);
  if (!r.rows.length) return null;
  return {
    controller_type: r.rows[0].controller_type,
    timestamp: r.rows[0].timestamp,
    config: JSON.parse(r.rows[0].config || "{}"),
    meta: JSON.parse(r.rows[0].meta || "{}"),
  };
}

export async function ensureTableExists() {
  try {
    // 1) flights
    const flightsExists = await pool.query(
      "SELECT table_name FROM tables() WHERE table_name = 'flights'"
    );
    if (flightsExists.rows.length === 0) {
      const createFlightsTable = `
        CREATE TABLE flights (
          flight_id SYMBOL,
          start_time TIMESTAMP,
          mass DOUBLE,
          arm_length DOUBLE,
          kc_0_0 DOUBLE,
          kc_1_1 DOUBLE,
          kc_2_2 DOUBLE,
          kc_0_3 DOUBLE,
          kc_1_4 DOUBLE,
          kc_2_5 DOUBLE,
          ki_0_0 DOUBLE,
          ki_1_1 DOUBLE,
          ki_2_2 DOUBLE,
          end_time TIMESTAMP,
          duration LONG,
          status SYMBOL
        ) TIMESTAMP(start_time) PARTITION BY DAY;
      `;
      await executeQueryWithRetry(createFlightsTable);
      console.log("✅ flights table created");
    }
    // columna opcional (ignora si ya existe)
    try {
      await pool.query(`ALTER TABLE flights ADD COLUMN controller_type SYMBOL`);
      console.log("✅ flights.controller_type added");
    } catch {}

    // 2) controller_config
    const ccExists = await pool.query(
      "SELECT table_name FROM tables() WHERE table_name = 'controller_config'"
    );
    if (ccExists.rows.length === 0) {
      const createCfg = `
        CREATE TABLE controller_config (
          timestamp TIMESTAMP,
          flight_id SYMBOL,
          controller_type SYMBOL,   -- 'PID' | 'LQR' | 'CUSTOM'
          config STRING,            -- JSON stringify
          meta STRING               -- JSON (preset, version, notas)
        ) TIMESTAMP(timestamp) PARTITION BY DAY;
      `;
      await executeQueryWithRetry(createCfg);
      console.log("✅ controller_config table created");
    }

    // 3) sensor_data
    const sensorExists = await pool.query(
      "SELECT table_name FROM tables() WHERE table_name = 'sensor_data'"
    );
    if (sensorExists.rows.length === 0) {
      const createSensorDataTable = `
        CREATE TABLE sensor_data (
          timestamp TIMESTAMP,
          flight_id SYMBOL,
          angle_roll_est DOUBLE,
          angle_pitch_est DOUBLE,
          angle_yaw DOUBLE,
          gyro_rate_roll DOUBLE,
          gyro_rate_pitch DOUBLE,
          gyro_rate_yaw DOUBLE,
          acc_x DOUBLE,
          acc_y DOUBLE,
          acc_z DOUBLE,
          tau_x DOUBLE,
          tau_y DOUBLE,
          tau_z DOUBLE,
          angle_roll DOUBLE,
          angle_pitch DOUBLE,
          error_phi DOUBLE,
          error_theta DOUBLE,
          input_roll DOUBLE,
          input_pitch DOUBLE,
          input_yaw DOUBLE,
          input_throttle DOUBLE,
          motor_1 DOUBLE,
          motor_2 DOUBLE,
          motor_3 DOUBLE,
          motor_4 DOUBLE,
          altura DOUBLE,
          flight_mode INT,
          device_id SYMBOL,
          roll DOUBLE,
          pitch DOUBLE,
          yaw DOUBLE,
          innov_roll DOUBLE,
          S_roll DOUBLE,
          innov_pitch DOUBLE,
          S_pitch DOUBLE,
          P_roll DOUBLE,
          P_pitch DOUBLE
        ) TIMESTAMP(timestamp) PARTITION BY DAY;
      `;
      await executeQueryWithRetry(createSensorDataTable);
      console.log("✅ sensor_data table created");
    } else {
      // columnas nuevas (idempotentes)
      try {
        await pool.query(
          `ALTER TABLE sensor_data ADD COLUMN input_throttle DOUBLE`
        );
      } catch {}
      try {
        await pool.query(
          `ALTER TABLE sensor_data ADD COLUMN innov_roll DOUBLE`
        );
      } catch {}
      try {
        await pool.query(`ALTER TABLE sensor_data ADD COLUMN S_roll DOUBLE`);
      } catch {}
      try {
        await pool.query(
          `ALTER TABLE sensor_data ADD COLUMN innov_pitch DOUBLE`
        );
      } catch {}
      try {
        await pool.query(`ALTER TABLE sensor_data ADD COLUMN S_pitch DOUBLE`);
      } catch {}
      try {
        await pool.query(`ALTER TABLE sensor_data ADD COLUMN P_roll DOUBLE`);
      } catch {}
      try {
        await pool.query(`ALTER TABLE sensor_data ADD COLUMN P_pitch DOUBLE`);
      } catch {}
    }

    // 4) control_state
    const controlExists = await pool.query(
      "SELECT table_name FROM tables() WHERE table_name = 'control_state'"
    );
    if (controlExists.rows.length === 0) {
      const createControlTable = `
        CREATE TABLE control_state (
          timestamp TIMESTAMP,
          modo INT,
          led_status BOOLEAN,
          motor_status BOOLEAN
        ) TIMESTAMP(timestamp) PARTITION BY DAY;
      `;
      await executeQueryWithRetry(createControlTable);
      console.log("✅ control_state table created");
    }

    return true;
  } catch (err) {
    console.error("❌ Error ensuring table exists:", err.message);
    return false;
  }
}

export async function listRecentFlights(limit = 10) {
  try {
    await ensureTableExists();
    const q = `
      SELECT flight_id, start_time, end_time, mass
      FROM flights
      ORDER BY start_time DESC
      LIMIT ${Number(limit) || 10}
    `;
    const r = await pool.query(q);
    return r.rows || [];
  } catch (e) {
    console.error("❌ listRecentFlights error:", e.message);
    return [];
  }
}

// Check QuestDB connection and ensure tables exist
export async function checkQuestDBConnection() {
  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log("✅ Connection to QuestDB verified");

    // Ensure tables exist
    await ensureTableExists();
    console.log("✅ Database tables verified");
    return true;
  } catch (err) {
    console.error("❌ Error connecting to QuestDB:", err);
    return false;
  }
}

// Export the pool and other utilities
export { formatWithPrecision, pool };
