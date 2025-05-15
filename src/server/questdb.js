import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new pg.Pool({
    host: 'localhost',
    port: 8812,
    user: 'admin',
    password: 'quest',
    database: 'qdb',
});

function safe(value) {
    return value === undefined || value === null ? 'NULL' : value;
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

// Inserta un nuevo vuelo (con los 9 datos correctos de Kc y Ki)
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


// Inserta datos de sensores asociados al vuelo
export async function insertSensorData(sensor, flightId) {
    const time = new Date().toISOString();

    const {
        RateRoll, RatePitch, RateYaw,
        tau_x, tau_y, tau_z,
        KalmanAngleRoll, KalmanAnglePitch,
        error_phi, error_theta,
        InputThrottle,
        InputRoll, InputPitch, InputYaw,
        MotorInput1, MotorInput2, MotorInput3, MotorInput4,
        Altura
    } = sensor;

    const query = `
        INSERT INTO sensor_data (
            flight_id, time,
            rate_roll, rate_pitch, rate_yaw,
            tau_x, tau_y, tau_z,
            kalman_angle_roll, kalman_angle_pitch,
            error_phi, error_theta,
            input_throttle, input_roll, input_pitch, input_yaw, -- Añadido input_throttle
            motor_1, motor_2, motor_3, motor_4,
            altura
        ) VALUES (
            '${flightId}', '${time}',
            ${safe(RateRoll)}, ${safe(RatePitch)}, ${safe(RateYaw)},
            ${safe(tau_x)}, ${safe(tau_y)}, ${safe(tau_z)},
            ${safe(KalmanAngleRoll)}, ${safe(KalmanAnglePitch)},
            ${safe(error_phi)}, ${safe(error_theta)},
            ${safe(InputThrottle)}, ${safe(InputRoll)}, ${safe(InputPitch)}, ${safe(InputYaw)},
            ${safe(MotorInput1)}, ${safe(MotorInput2)}, ${safe(MotorInput3)}, ${safe(MotorInput4)},
            ${safe(Altura)}
        )
    `;
    try {
        await executeQueryWithRetry(query);
    } catch (err) {
        console.error("❌ Insert error:", err.message);
    }
}

// Exporta la función insertControlState
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