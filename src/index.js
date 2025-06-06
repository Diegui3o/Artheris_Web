import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { WebSocketServer } from "ws";
import createSimulationRouter from './config/st_simulation.js';
import DroneSimulator from './server/simulator.js';
import { insertSensorData } from './server/questdb.js';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Servidor WebSocket puro para ESP32 (puerto 3003, ruta /esp32)
const wssServer = http.createServer();
const wss = new WebSocketServer({ server: wssServer, path: "/esp32" });
wssServer.listen(3003, () => {
    console.log("Raw WebSocket server for ESP32 listening on port 3003 (path /esp32)");
});

// Central state object
const state = {
    isRecording: false,
    isSimulating: false,
    flightId: null,
    latestTelemetry: {},
    telemetries: [] // Para almacenar telemetrías durante la grabación
};

// --- SIMULATION STATE (for st_simulation.js) ---
const simState = {
    simMode: false,
    simInterval: null,
    simulator: null,
    simHistory: [],
    simulationParams: {
        Ixx: 0.01, Iyy: 0.01, Izz: 0.02, mass: 1.0, g: 9.81, T: 9.81
    },
    simControl: { T: 9.81, tau_x: 0, tau_y: 0, tau_z: 0 }
};

// WebSocket - Clientes
io.on("connection", socket => {
    // Manejo de conexión de socket (sin lógica específica en este momento)
});

// WebSocket - ESP32
wss.on("connection", (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`✅ ESP32 conectado por WebSocket puro desde ${clientIP}`);
    ws.on("message", (message) => {
        let data;
        let parsed = false;
        // Intentar parsear como JSON
        try {
            data = JSON.parse(message.toString());
            parsed = true;
        } catch (e) {
            // Si no es JSON, intentar parsear como CSV
            const msgStr = message.toString();
            const values = msgStr.split(",").map(Number);
            //console.log("[ESP32] values array:", values, "length:", values.length);
            const getVal = (i) => (typeof values[i] === 'number' && !isNaN(values[i]) ? values[i] : 0);
            data = {
                timestamp: getVal(0),
                AngleRoll: getVal(1),
                AnglePitch: getVal(2),
                AngleYaw: getVal(3),
                RateRoll: getVal(4),
                RatePitch: getVal(5),
                RateYaw: getVal(6),
                AccX: getVal(7),
                AccY: getVal(8),
                AccZ: getVal(9),
                tau_x: getVal(10), // Aplica función clamp
                tau_y: getVal(11),
                tau_z: getVal(12),
                KalmanAngleRoll: getVal(13),
                KalmanAnglePitch: getVal(14),
                error_phi: getVal(15),
                error_theta: getVal(16),
                InputThrottle: getVal(17),
                InputRoll: getVal(18),
                InputPitch: getVal(19),
                InputYaw: getVal(20),
                MotorInput1: getVal(21),
                MotorInput2: getVal(22),
                MotorInput3: getVal(23),
                MotorInput4: getVal(24),
                Altura: getVal(25),
                modo: getVal(26)
            };
            parsed = true;
        }
        if (!parsed) {
            //console.log("[ESP32] Mensaje no JSON ni CSV válido:", message.toString());
            return;
        }
        // Emitir modo y led si están presentes
        if (typeof data.modo !== 'undefined') {
            io.emit("modo", data.modo);
        }
        if (typeof data.led !== 'undefined') {
            io.emit("led", { led: !!data.led });
        }
        // Emitir datos combinados y eventos esperados por el frontend
        const combined = {
            ...data,
            roll: data.AngleRoll ?? data.roll,
            pitch: data.AnglePitch ?? data.pitch,
            yaw: data.AngleYaw ?? data.yaw,
            time: new Date().toISOString(),
        };
        // --- ACTUALIZAR TORQUES DE SIMULACIÓN SI LA SIMULACIÓN ESTÁ ACTIVA ---
        if (simState && simState.simMode) {
            simState.simControl = {
                T: typeof data.T === 'number' ? data.T : (typeof data.InputThrottle === 'number' ? data.InputThrottle : simState.simControl.T),
                tau_x: typeof data.tau_x === 'number' ? data.tau_x : simState.simControl.tau_x,
                tau_y: typeof data.tau_y === 'number' ? data.tau_y : simState.simControl.tau_y,
                tau_z: typeof data.tau_z === 'number' ? data.tau_z : simState.simControl.tau_z
            };
        }
        //console.log("[BACKEND] Emitting sensorUpdate:", combined); // <-- Debug log
        state.latestTelemetry = combined;
        io.emit("sensorUpdate", combined);
        io.emit("angles", combined);
        io.emit("datosCompleto", combined);
        io.emit("sensorData", {
            time: combined.time,
            value: combined.AngleRoll,
            pitch: combined.AnglePitch,
        });
        if (state.isRecording) state.telemetries.push(combined);
        // --- GUARDAR EN QUESTDB SI HAY GRABACIÓN ACTIVA ---
        if (state.isRecording && state.flightId) {
            insertSensorData(combined, state.flightId)
                .catch(err => console.error('❌ Error guardando datos en QuestDB:', err));
        }
    });
    ws.on("close", () => {
        console.log("❌ ESP32 desconectado (ws)");
    });
});
function clamp(val, min = -5, max = 5) {
    return Math.min(Math.max(val, min), max);
}
// Example endpoint
app.get('/modo/actual', (req, res) => {
    console.log('🔎 [DEBUG] GET /modo/actual called');
    // Return the current mode from the latest telemetry, or 1 if not available
    res.json({ modo: (typeof state.latestTelemetry.modo === 'number' && !isNaN(state.latestTelemetry.modo)) ? state.latestTelemetry.modo : 1 });
});

app.use(
    '/',
    createSimulationRouter({
        simState,
        io
    })
);

server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});

export { io, wss, state };
