import express from 'express';
import DroneSimulator from '../server/simulator.js';

// Export a function that takes dependencies and returns the router
export default function createSimulationRouter({
    simState,
    io
}) {
    const router = express.Router();
    // POST /simulate/start
    router.post('/simulate/start', (req, res) => {
        console.log('[DEBUG] POST /simulate/start called. simMode:', simState.simMode, 'IP:', req.ip, 'Body:', req.body);
        if (simState.simMode) {
            console.warn('[WARN] Simulación ya activa. Rejecting new start.');
            return res.status(400).json({ error: 'Simulación ya activa' });
        }
        if (simState.simInterval) {
            clearInterval(simState.simInterval);
            simState.simInterval = null;
            console.log('[INFO] Intervalo de simulación anterior limpiado antes de iniciar uno nuevo.');
        }
        if (req.body && typeof req.body === 'object') {
            Object.assign(simState.simulationParams, req.body);
            if (simState.simulationParams.mass && simState.simulationParams.g) {
                simState.simulationParams.T = simState.simulationParams.mass * simState.simulationParams.g;
            }
        }
        simState.simControl = {
            T: simState.simulationParams.mass * simState.simulationParams.g,
            tau_x: 0,
            tau_y: 0,
            tau_z: 0
        };
        simState.simulator = new DroneSimulator({
            ...simState.simulationParams,
            initial: { x: 0, y: 0, z: 0, phi: 0, theta: 0, psi: 0 }
        });
        simState.simMode = true;
        simState.simHistory = [];
        simState.simInterval = setInterval(() => {
            if (!simState.simMode) {
                clearInterval(simState.simInterval);
                simState.simInterval = null;
                return;
            }
            const T = simState.simControl.T;
            const tau_x = simState.simControl.tau_x;
            const tau_y = simState.simControl.tau_y;
            const tau_z = simState.simControl.tau_z;

            if (simState.simulator.phi_ref === 0 && simState.simulator.theta_ref === 0) {
                simState.simulator.generateTestReferences(simState.simulator.simTime);
                console.log('[SIM] Usando referencias de prueba - phi_ref:', simState.simulator.phi_ref.toFixed(4), 'theta_ref:', simState.simulator.theta_ref.toFixed(4));
            }

            // Use PID
            const sensor = simState.simulator.stepWithPID(T, 0.01);

            if (!simState.simulator.simTime) simState.simulator.simTime = 0;
            simState.simulator.simTime += 0.03;
            function sanitizeAngle(val) {
                if (!isFinite(val) || Math.abs(val) > 1e3) return 0;
                if (val > 2 * Math.PI) return 2 * Math.PI;
                if (val < -2 * Math.PI) return -2 * Math.PI;
                return val;
            }
            const safeRoll = sanitizeAngle(sensor.roll);
            const safePitch = sanitizeAngle(sensor.pitch);
            const safeYaw = sanitizeAngle(sensor.yaw);
            const [calculatedT, calculatedTauX, calculatedTauY, calculatedTauZ] = sensor.inputs || [T, 0, 0, 0];

            const simData = {
                AngleRoll: safeRoll,
                AnglePitch: safePitch,
                AngleYaw: safeYaw,
                AccX: sensor.ax,
                AccY: sensor.ay,
                AccZ: sensor.az,
                RateRoll: sensor.gx,
                RatePitch: sensor.gy,
                RateYaw: sensor.gz,
                time: new Date().toISOString(),
                simTime: simState.simulator.simTime,
                state: simState.simulator.state.slice(),
                inputs: [calculatedT, calculatedTauX, calculatedTauY, calculatedTauZ, safeRoll, safePitch, safeYaw]
            };
            simState.simHistory.push(simData);
            io.emit("datosSimulacion", simData);
        }, 30);
        res.json({ message: 'Simulación iniciada', params: simState.simulationParams });
    });
    router.post('/simulate/stop', (req, res) => {
        if (!simState.simMode) {
            return res.status(400).json({ error: 'No hay simulación activa' });
        }
        simState.simMode = false;
        if (simState.simInterval) {
            clearInterval(simState.simInterval);
            simState.simInterval = null;
        }
        res.json({ message: 'Simulación detenida' });
    });
    router.get('/simulate/status', (req, res) => {
        res.json({ simActive: !!simState.simMode });
    });
    router.get('/simulate/history', (req, res) => {
        res.json({ history: simState.simHistory });
    });
    // Buildcombined Function () to unify lasticate data, lastcontrol and lastmotors
    function buildCombined() {
        const ANGLES_FIELDS = [
            'AngleRoll', 'AnglePitch', 'AngleYaw',
            'RateRoll', 'RatePitch', 'RateYaw',
            'AccX', 'AccY', 'AccZ'
        ];
        const CONTROL_FIELDS = [
            'tau_x', 'tau_y', 'tau_z',
            'KalmanAngleRoll', 'KalmanAnglePitch',
            'error_phi', 'error_theta',
            'InputThrottle', 'InputRoll', 'InputPitch', 'InputYaw'
        ];
        const MOTORS_FIELDS = [
            'MotorInput1', 'MotorInput2', 'MotorInput3', 'MotorInput4',
            'Altura', 'modo'
        ];
        const combined = {};
        // Map AngleRoll, AnglePitch, AngleYaw from AngleRoll_est, AnglePitch_est, AngleYaw if present
        combined.AngleRoll = Number(lastAngles.AngleRoll_est ?? lastAngles.AngleRoll) || 0;
        combined.AnglePitch = Number(lastAngles.AnglePitch_est ?? lastAngles.AnglePitch) || 0;
        combined.AngleYaw = Number(lastAngles.AngleYaw ?? lastAngles.AngleYaw_est) || 0;
        combined.roll = combined.AngleRoll;
        combined.pitch = combined.AnglePitch;
        combined.yaw = combined.AngleYaw;

        for (const key of ANGLES_FIELDS) {
            if (["AngleRoll", "AnglePitch", "AngleYaw"].includes(key)) continue;
            combined[key] = Number(lastAngles[key]) || 0;
        }
        for (const key of CONTROL_FIELDS) {
            combined[key] = Number(lastControl[key]) || 0;
        }
        for (const key of MOTORS_FIELDS) {
            combined[key] = Number(lastMotors[key]) || 0;
        }

        combined.RawRoll = Number(lastAngles.RawRoll) || 0;
        combined.RawPitch = Number(lastAngles.RawPitch) || 0;
        combined.RawYaw = Number(lastAngles.RawYaw) || 0;
        combined.time = new Date().toISOString();
        combined.modo = combined.modo ?? 0;
        return combined;
    }

    // Endpoint to update simulation control inputs (T, tau_x, tau_y, tau_z)
    router.post('/simulate/control', (req, res) => {
        const { T, tau_x, tau_y, tau_z } = req.body || {};
        if (
            typeof T === 'number' &&
            typeof tau_x === 'number' &&
            typeof tau_y === 'number' &&
            typeof tau_z === 'number'
        ) {
            simState.simControl = { T, tau_x, tau_y, tau_z };
            return res.json({ ok: true, simControl: simState.simControl });
        }
        res.status(400).json({ error: 'Valores de control inválidos' });
    });

    return router;
}