import { config } from 'dotenv';
import env from 'env-var';

config();

export const envs = {
    PORT: env.get('PORT').required().asPortNumber(),
    MQTT_BROKER_URL: env.get('MQTT_BROKER_URL').required().asString(),
    CONTROL_TOPIC: env.get('CONTROL_TOPIC').required().asString(),
    ANGLES_TOPIC: env.get('ANGLES_TOPIC').required().asString(),
    RATES_TOPIC: env.get('RATES_TOPIC').required().asString(),
    ACC_TOPIC: env.get('ACC_TOPIC').required().asString(),
    GYRO_TOPIC: env.get('GYRO_TOPIC').required().asString(),
    KALMAN_TOPIC: env.get('KALMAN_TOPIC').required().asString(),
    MOTORS_TOPIC: env.get('MOTORS_TOPIC').required().asString(),
    MODE_TOPIC: env.get('MODE_TOPIC').required().asString(),
};
