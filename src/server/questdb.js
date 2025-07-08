import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new pg.Pool({
    host: 'localhost',
    port: 8812,
    user: 'admin',
    password: 'quest',
    database: 'qdb',
});

// Verify connection to Questdb at the start
pool.query('SELECT 1')
    .then(() => console.log('✅ Conexión a QuestDB establecida'))
    .catch(err => {
        console.error('❌ No se pudo conectar a QuestDB');
    });

function safe(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'NULL';
    }
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'number') {
        return Number(value.toFixed(3));
    }
    return value;
}

function formatWithPrecision(value, decimals = 3) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'NULL';
    }
    if (typeof value === 'number') {
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
            if (error.code === '00000' && error.message.includes('table busy')) {
                console.warn(`⚠️ Table busy, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    throw new Error('❌ Max retries reached, could not execute query');
}

export async function insertNewFlight(Kc, Ki, mass = null, armLength = null) {
    const startTime = new Date().toISOString();
    const flightId = uuidv4();

    const kc_array = [
        Kc['Kc_at[0][0]'], Kc['Kc_at[1][1]'], Kc['Kc_at[2][2]'],
        Kc['Kc_at[0][3]'], Kc['Kc_at[1][4]'], Kc['Kc_at[2][5]']
    ];

    const ki_array = [
        Ki['Ki_at[0][0]'], Ki['Ki_at[1][1]'], Ki['Ki_at[2][2]']
    ];

    const [
        kc_0_0, kc_1_1, kc_2_2, kc_0_3, kc_1_4, kc_2_5
    ] = kc_array.map(safe);

    const [
        ki_0_0, ki_1_1, ki_2_2
    ] = ki_array.map(safe);

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
        return flightId;
    } catch (err) {
        console.error('❌ Error al insertar nuevo vuelo:', err);
        throw err;
    }
}

export async function insertSensorData(sensor, flightId) {
    const time = new Date().toISOString();

    const safeWithPrecision = (value, decimals = 3) => {
        if (value === undefined || value === null || isNaN(value)) {
            return 'NULL';
        }
        if (typeof value === 'number') {
            return Number(value.toFixed(decimals));
        }
        return value;
    };

    // Ensures that all the required fields are present and are numerical
    const safeNum = v => (typeof v === 'number' && !isNaN(v) ? v : 0);
    const {
        AngleRoll = 0, AnglePitch = 0, AngleYaw = 0,
        RateRoll = 0, RatePitch = 0, RateYaw = 0,
        AccX = 0, AccY = 0, AccZ = 0,
        tau_x = 0, tau_y = 0, tau_z = 0,
        KalmanAngleRoll = 0, KalmanAnglePitch = 0,
        error_phi = 0, error_theta = 0,
        InputThrottle = 0,
        InputRoll = 0, InputPitch = 0, InputYaw = 0,
        MotorInput1 = 0, MotorInput2 = 0, MotorInput3 = 0, MotorInput4 = 0,
        Altura = 0
    } = sensor || {}; const query = `
        INSERT INTO sensor_data (
            flight_id, time,
            angle_roll, angle_pitch, angle_yaw,
            rate_roll, rate_pitch, rate_yaw,
            acc_x, acc_y, acc_z,
            tau_x, tau_y, tau_z,
            kalman_angle_roll, kalman_angle_pitch,
            error_phi, error_theta,
            input_throttle, input_roll, input_pitch, input_yaw,
            motor_1, motor_2, motor_3, motor_4,
            altura
        ) VALUES (
            '${flightId}', '${time}',
            ${safeWithPrecision(AngleRoll, 3)}, ${safeWithPrecision(AnglePitch, 3)}, ${safeWithPrecision(AngleYaw, 3)},
            ${safeWithPrecision(RateRoll, 3)}, ${safeWithPrecision(RatePitch, 3)}, ${safeWithPrecision(RateYaw, 3)},
            ${safeWithPrecision(AccX, 3)}, ${safeWithPrecision(AccY, 3)}, ${safeWithPrecision(AccZ, 3)},
            ${safeWithPrecision(tau_x, 3)}, ${safeWithPrecision(tau_y, 3)}, ${safeWithPrecision(tau_z, 3)},
            ${safeWithPrecision(KalmanAngleRoll, 3)}, ${safeWithPrecision(KalmanAnglePitch, 3)},
            ${safeWithPrecision(error_phi, 3)}, ${safeWithPrecision(error_theta, 3)},
            ${safeWithPrecision(InputThrottle, 3)}, ${safeWithPrecision(InputRoll, 3)}, ${safeWithPrecision(InputPitch, 3)}, ${safeWithPrecision(InputYaw, 3)},
            ${safeWithPrecision(MotorInput1, 3)}, ${safeWithPrecision(MotorInput2, 3)}, ${safeWithPrecision(MotorInput3, 3)}, ${safeWithPrecision(MotorInput4, 3)},
            ${safeWithPrecision(Altura, 3)}
        )
    `;
    const requiredFields = ['AngleRoll', 'AnglePitch', 'AngleYaw', 'RateRoll', 'RatePitch', 'RateYaw'];
    for (const field of requiredFields) {
        if (sensor[field] === undefined) {
            console.warn(`⚠️ Campo requerido faltante: ${field}, se usará 0`);
        }
    }
    try {
        await executeQueryWithRetry(query);
    } catch (err) {
        console.error("❌ Insert error:", err.message);
    }
}

export async function insertControlState(modo, ledStatus, motorStatus) {
    const time = new Date().toISOString();
    const query = `
        INSERT INTO control_state (time, modo, led_status, motor_status)
        VALUES ('${time}', ${safe(modo)}, ${safe(ledStatus)}, ${safe(motorStatus)})
    `;
    try {
        await executeQueryWithRetry(query);
    } catch (err) {
        console.error("❌ Insert error:", err.message);
    }
}

export async function printLastSensorData(n = 10, returnRows = false) {
    try {
        const result = await pool.query(`SELECT * FROM sensor_data ORDER BY time DESC LIMIT ${n}`);
        if (returnRows) return result.rows;
        console.log('Últimos registros de sensor_data:');
        console.table(result.rows);
    } catch (err) {
        console.error('❌ Error al consultar sensor_data:', err.message);
        if (returnRows) return [];
    }
}

export async function checkQuestDBConnection() {
    try {
        const res = await pool.query('SELECT 1');
        console.log('✅ Conexión a QuestDB verificada correctamente');
        return true;
    } catch (err) {
        console.error('❌ Error al conectar con QuestDB:', err);
        return false;
    }
}

export { formatWithPrecision };