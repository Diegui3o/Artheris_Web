import pg from "pg";
import { v4 as uuidv4 } from "uuid";

const pool = new pg.Pool({
  host: "localhost",
  port: 8812,
  user: "admin",
  password: "quest",
  database: "qdb",
});

// Verify connection to Questdb at the start
pool
  .query("SELECT 1")
  .then(() => console.log("✅ Connection to Questdb Established"))
  .catch((err) => {
    console.error("❌ Could not be connected to Questdb");
  });

function safe(value) {
  if (value === undefined || value === null || isNaN(value)) {
    return "NULL";
  }
  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (typeof value === "number") {
    return Number(value.toFixed(3));
  }
  return value;
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

async function executeQueryWithRetry(query, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(query);
      return;
    } catch (error) {
      if (error.code === "00000" && error.message.includes("table busy")) {
        console.warn(`⚠️ Table busy, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("❌ Max retries reached, could not execute query");
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
        `UPDATE flights SET end_time = now() WHERE flight_id = $1 AND end_time IS NULL`,
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

export async function insertNewFlight(Kc, Ki, mass = null, armLength = null) {
  // Ensure tables exist before inserting data
  await ensureTableExists();

  const flightId = uuidv4();
  const startTime = new Date().toISOString();

  const kc_array = [
    Kc["Kc_at[0][0]"],
    Kc["Kc_at[1][1]"],
    Kc["Kc_at[2][2]"],
    Kc["Kc_at[0][3]"],
    Kc["Kc_at[1][4]"],
    Kc["Kc_at[2][5]"],
  ];

  const ki_array = [Ki["Ki_at[0][0]"], Ki["Ki_at[1][1]"], Ki["Ki_at[2][2]"]];

  const [kc_0_0, kc_1_1, kc_2_2, kc_0_3, kc_1_4, kc_2_5] = kc_array.map(safe);

  const [ki_0_0, ki_1_1, ki_2_2] = ki_array.map(safe);

  const query = `
        INSERT INTO flights (
            flight_id, start_time, mass, arm_length,
            kc_0_0, kc_1_1, kc_2_2,
            kc_0_3, kc_1_4, kc_2_5,
            ki_0_0, ki_1_1, ki_2_2
        ) VALUES (
            '${flightId}', '${startTime}', ${safe(mass)}, ${safe(armLength)},
            ${kc_0_0}, ${kc_1_1}, ${kc_2_2},
            ${kc_0_3}, ${kc_1_4}, ${kc_2_5},
            ${ki_0_0}, ${ki_1_1}, ${ki_2_2}
        )
    `;

  try {
    await executeQueryWithRetry(query);
    console.log("\n" + "=".repeat(80));
    console.log(`✅ FLIGHT CREATED SUCCESSFULLY`);
    console.log("=".repeat(80));
    console.log(`🚀 FLIGHT ID: ${flightId}`);
    console.log("=".repeat(80));
    console.log("🔍 To query this flight in QuestDB Web Console:");
    console.log(`SELECT * FROM flights WHERE flight_id = '${flightId}';`);
    console.log(`SELECT * FROM sensor_data WHERE flight_id = '${flightId}';`);
    console.log("=".repeat(80) + "\n");
    return flightId;
  } catch (err) {
    console.error("❌ Error when inserting new flight:", err);
    throw err;
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

  // 1) Timestamp correcto
  //   - usa isoTime si viene en formato válido
  //   - si no, intenta con telemetryTime/`timestamp` si fuera ISO (no lo es en tu caso)
  //   - si nada válido, usa now()
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
        ${safe(deviceId)},
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

export async function getFlightData(flightId) {
  try {
    await ensureTableExists();

    // Get flight info
    const flightQuery = `
            SELECT * FROM flights 
            WHERE flight_id = '${flightId}'
            LIMIT 1`;

    const flightResult = await pool.query(flightQuery);

    if (flightResult.rows.length === 0) {
      console.log(`❌ No flight found with ID: ${flightId}`);
      return null;
    }

    // Get sensor data for this flight
    const sensorQuery = `
            SELECT timestamp, angle_roll, angle_pitch, angle_yaw, 
                   acc_x, acc_y, acc_z, input_throttle
            FROM sensor_data 
            WHERE flight_id = '${flightId}'
            ORDER BY timestamp DESC
            LIMIT 10`;

    const sensorResult = await pool.query(sensorQuery);

    // Format the output
    console.log("\n📋 Flight Information:");
    console.log("----------------------------------------");
    console.log(`ID: ${flightResult.rows[0].flight_id}`);
    console.log(`Start Time: ${flightResult.rows[0].start_time}`);
    console.log(`Mass: ${flightResult.rows[0].mass} kg`);
    const st = flightResult.rows[0].end_time ? "completed" : "recording";
    console.log(`Status: ${st}`);

    console.log("\n📊 Latest Sensor Data:");
    console.log("----------------------------------------");
    if (sensorResult.rows.length > 0) {
      console.table(sensorResult.rows);
    } else {
      console.log("No sensor data available for this flight yet.");
    }

    return {
      flight: flightResult.rows[0],
      sensorData: sensorResult.rows,
    };
  } catch (err) {
    console.error("❌ Error retrieving flight data:", err.message);
    return null;
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

export async function ensureTableExists() {
  try {
    // flights
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
    } else {
    }

    // sensor_data
    const sensorExists = await pool.query(
      "SELECT table_name FROM tables() WHERE table_name = 'sensor_data'"
    );
    try {
      await pool.query(`ALTER TABLE sensor_data ADD COLUMN innov_roll DOUBLE`);
    } catch {}
    try {
      await pool.query(`ALTER TABLE sensor_data ADD COLUMN S_roll DOUBLE`);
    } catch {}
    try {
      await pool.query(`ALTER TABLE sensor_data ADD COLUMN innov_pitch DOUBLE`);
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

    // Add input_throttle column if it doesn't exist
    if (sensorExists.rows.length > 0) {
      try {
        await pool.query(
          `ALTER TABLE sensor_data ADD COLUMN input_throttle DOUBLE`
        );
        console.log("✅ sensor_data.input_throttle column added");
      } catch (err) {
        // Ignore if column already exists
        if (!err.message.includes("already exists")) {
          console.error("Error adding input_throttle column:", err);
        }
      }
    }

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
            motor_1 DOUBLE,
            motor_2 DOUBLE,
            motor_3 DOUBLE,
            motor_4 DOUBLE,
            altura DOUBLE,
            flight_mode INT,
            device_id SYMBOL,
            roll DOUBLE,
            pitch DOUBLE,
            yaw DOUBLE
          ) TIMESTAMP(timestamp) PARTITION BY DAY;
        `;
      await executeQueryWithRetry(createSensorDataTable);
      console.log("✅ sensor_data table created");
    } else {
    }

    // control_state (lo usas en insertControlState)
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
    } else {
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

export { formatWithPrecision, pool };
