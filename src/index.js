import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { WebSocketServer } from "ws";
import { handleSocketConnection } from "./config/socketHandler.js";
import createSimulationRouter from "./config/st_simulation.js";
import createRecordingRouter from "./config/recording.js";
import { insertSensorData } from "./server/questdb.js";
import { configureWebRTC } from "./config/webrtc.js";

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

// --- ENDPOINTS BÁSICOS PARA REGISTRO Y CONSULTA DE DRONES POR ID ---
import fs from "fs";
import path from "path";

const DRONES_FILE = path.join(process.cwd(), "src", "server", "drones.json");

function readDrones() {
  if (!fs.existsSync(DRONES_FILE)) return [];
  return JSON.parse(fs.readFileSync(DRONES_FILE, "utf8"));
}
function writeDrones(drones) {
  fs.writeFileSync(DRONES_FILE, JSON.stringify(drones, null, 2));
}

// Registrar o actualizar dron por ID
app.put("/api/drones/:id", (req, res) => {
  const { id } = req.params;
  const data = req.body;
  let drones = readDrones();
  let dron = drones.find((d) => d.id === id);
  if (dron) {
    Object.assign(dron, data);
  } else {
    dron = { id, ...data };
    drones.push(dron);
  }
  writeDrones(drones);
  res.json(dron);
});

// Obtener dron por ID
app.get("/api/drones/:id", (req, res) => {
  const { id } = req.params;
  const drones = readDrones();
  const dron = drones.find((d) => d.id === id);
  if (!dron) return res.status(404).json({ error: "No encontrado" });
  res.json(dron);
});

// Listar todos los drones (opcional)
app.get("/api/drones", (req, res) => {
  res.json(readDrones());
});

// --- Lista global de dispositivos conectados ---
// Endpoint para obtener los dispositivos conectados
app.get("/api/devices", (req, res) => {
  res.json(Object.values(dispositivosConectados));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Server WebSocket for ESP32 (port 3003, path /esp32)
const wssServer = http.createServer();
const wss = new WebSocketServer({ server: wssServer, path: "/esp32" });

let serverInstance;

process.on("SIGTERM", () => {
  if (serverInstance) {
    serverInstance.close();
  }
});

process.on("SIGINT", () => {
  if (serverInstance) {
    serverInstance.close();
  }
});

serverInstance = wssServer.listen(3003, () => {
  console.log(
    "Raw WebSocket server for ESP32 listening on port 3003 (path /esp32)"
  );
});

// Central state object
const state = {
  isRecording: false,
  isSimulating: false,
  flightId: null,
  latestTelemetry: {},
  telemetries: [],
};

const simState = {
  simMode: false,
  simInterval: null,
  simulator: null,
  simHistory: [],
  simulationParams: {
    Ixx: 0.01,
    Iyy: 0.01,
    Izz: 0.02,
    mass: 1.0,
    g: 9.81,
    T: 9.81,
  },
  simControl: { T: 9.81, tau_x: 0, tau_y: 0, tau_z: 0 },
};

// WebSocket - Clientes
io.on("connection", (socket) => {
  // Al conectar un cliente web, enviar el estado de todos los dispositivos
  const estados = Object.values(dispositivosConectados).map((device) => ({
    id: device.id,
    status: device.conectado ? "connected" : "disconnected",
    nombre: device.nombre || device.id,
  }));
  socket.emit("deviceStatusAll", estados);
});

const dispositivosConectados = {};
const esp32Sockets = {};
const ultimoContacto = {};

function emitirEstadoDispositivos() {
  const estados = Object.values(dispositivosConectados)
    .filter((d) => d.conectado)
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      status: "connected",
    }));
  io.emit("deviceStatusAll", estados);
}

// WebSocket - ESP32
wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`✅ ESP32 conectado por WebSocket puro desde ${clientIP}`);
  ws.on("message", (message) => {
    let identificador = null;
    try {
      const data = JSON.parse(message.toString());
      if (data.id) {
        identificador = data.id;
        const ipId = clientIP;
        if (
          dispositivosConectados[ipId] &&
          dispositivosConectados[ipId].ws === ws
        ) {
          delete dispositivosConectados[ipId];
        }
        if (!dispositivosConectados[identificador]) {
          dispositivosConectados[identificador] = {
            id: identificador,
            nombre: data.nombre || identificador,
            conectado: true,
            ip: clientIP,
            ws: ws,
          };
        } else {
          dispositivosConectados[identificador].conectado = true;
          dispositivosConectados[identificador].ws = ws;
        }
        esp32Sockets[identificador] = ws;
        ws.deviceId = identificador;
        ultimoContacto[identificador] = Date.now();
        emitirEstadoDispositivos();
      }
    } catch (e) {}
    let data;
    let parsed = false;
    if (ws.deviceId) {
      ultimoContacto[ws.deviceId] = Date.now();
    }
    try {
      data = JSON.parse(message.toString());
      parsed = true;
      if (data.id) {
        const ipId = clientIP;
        if (
          dispositivosConectados[ipId] &&
          dispositivosConectados[ipId].ws === ws
        ) {
          delete dispositivosConectados[ipId];
        }
      }
    } catch (e) {
      // If it is not Json, try to parse as CSV
      const msgStr = message.toString();
      const values = msgStr.split(",").map(Number);
      //console.log("[ESP32] values array:", values, "length:", values.length);
      const getVal = (i) =>
        typeof values[i] === "number" && !isNaN(values[i]) ? values[i] : 0;
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
        tau_x: getVal(10),
        tau_y: getVal(11),
        tau_z: getVal(12),
        KalmanAngleRoll: getVal(13),
        KalmanAnglePitch: getVal(14),
        error_phi: getVal(15),
        error_theta: getVal(16),
        InputRoll: getVal(18),
        InputPitch: getVal(19),
        InputYaw: getVal(20),
        MotorInput1: getVal(21),
        MotorInput2: getVal(22),
        MotorInput3: getVal(23),
        MotorInput4: getVal(24),
        Altura: getVal(25),
        modo: getVal(26),
      };
      parsed = true;
    }
    if (!parsed) {
      //console.log("[ESP32] Mensaje no JSON ni CSV válido:", message.toString());
      return;
    }
    if (typeof data.modo !== "undefined") {
      io.emit("modo", data.modo);
    }
    if (typeof data.led !== "undefined") {
      io.emit("led", { led: !!data.led });
    }
    const combined = {
      ...data,
      id: identificador,
      roll: data.AngleRoll ?? data.roll,
      pitch: data.AnglePitch ?? data.pitch,
      yaw: data.AngleYaw ?? data.yaw,
      time: new Date().toISOString(),
    };
    if (simState && simState.simMode && simState.simulator) {
      if (
        typeof data.KalmanAngleRoll === "number" &&
        typeof data.KalmanAnglePitch === "number"
      ) {
        const phi_ref = (data.KalmanAngleRoll * Math.PI) / 180;
        const theta_ref = (data.KalmanAnglePitch * Math.PI) / 180;
        console.log("[ESP32 DEBUG] Actualizando referencias del simulador:", {
          KalmanAngleRoll: data.KalmanAngleRoll,
          KalmanAnglePitch: data.KalmanAnglePitch,
          phi_ref: phi_ref.toFixed(4),
          theta_ref: theta_ref.toFixed(4),
        });
        simState.simulator.setReferenceAngles(phi_ref, theta_ref);
      }
      simState.simControl = {
        T:
          typeof data.T === "number"
            ? data.T
            : typeof data.InputThrottle === "number"
            ? data.InputThrottle
            : simState.simControl.T,
        tau_x:
          typeof data.tau_x === "number"
            ? clampWithThreshold(data.tau_x)
            : simState.simControl.tau_x,
        tau_y:
          typeof data.tau_y === "number"
            ? clampWithThreshold(data.tau_y)
            : simState.simControl.tau_y,
        tau_z:
          typeof data.tau_z === "number"
            ? clampWithThreshold(data.tau_z)
            : simState.simControl.tau_z,
      };
    }
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
    if (state.isRecording && state.flightId) {
      insertSensorData(combined, state.flightId).catch((err) =>
        console.error("❌ Error guardando datos en QuestDB:", err)
      );
    }
  });
  ws.on("close", () => {
    // Elimina completamente el dispositivo del registro
    if (ws.deviceId && dispositivosConectados[ws.deviceId]) {
      delete dispositivosConectados[ws.deviceId];
    }
    if (ws.deviceId && esp32Sockets[ws.deviceId]) {
      delete esp32Sockets[ws.deviceId];
    }
    console.log("❌ ESP32 desconectado (ws)");
    // Notificar a los clientes web el estado completo actualizado
    emitirEstadoDispositivos();
  });
});
function clamp(val, min = -5, max = 5) {
  return Math.min(Math.max(val, min), max);
}

function clampWithThreshold(val, threshold = 0.01, min = -5, max = 5) {
  if (typeof val !== "number" || isNaN(val)) return 0;
  // Si el valor absoluto es menor que el umbral, forzar a cero
  if (Math.abs(val) < threshold) return 0;
  return Math.min(Math.max(val, min), max);
}

app.get("/modo/actual", (req, res) => {
  console.log("🔎 [DEBUG] GET /modo/actual called");
  res.json({
    modo:
      typeof state.latestTelemetry.modo === "number" &&
      !isNaN(state.latestTelemetry.modo)
        ? state.latestTelemetry.modo
        : 1,
  });
});

app.get("/modo/:mode", (req, res) => {
  const mode = parseInt(req.params.mode);
  if (isNaN(mode) || mode < 0 || mode > 10) {
    return res
      .status(400)
      .json({ error: "Modo inválido. Debe ser un número entre 0 y 10." });
  }

  console.log(`🔄 [DEBUG] Cambiando modo a: ${mode}`);

  // Send command to all connected Esp32
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      const command = JSON.stringify({
        type: "command",
        payload: { mode },
      });
      client.send(command);
      console.log(`📤 Enviando comando de modo al ESP32: ${command}`);
    }
  });
  state.latestTelemetry.modo = mode;
  io.emit("modo", mode);

  res.json({ modo: mode, message: `Modo cambiado a ${mode}` });
});

app.post("/led/on", (req, res) => {
  console.log("💡 [DEBUG] Encendiendo LED");

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      const command = JSON.stringify({
        type: "command",
        payload: { led: true },
      });
      client.send(command);
      console.log(`📤 Enviando comando LED ON al ESP32: ${command}`);
    }
  });
  io.emit("led", { led: true });

  res.json({ led: true, message: "LED encendido" });
});

app.post("/led/off", (req, res) => {
  console.log("💡 [DEBUG] Apagando LED");

  // Send command to all connected Esp32
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      const command = JSON.stringify({
        type: "command",
        payload: { led: false },
      });
      client.send(command);
      console.log(`📤 Enviando comando LED OFF al ESP32: ${command}`);
    }
  });
  io.emit("led", { led: false });

  res.json({ led: false, message: "LED apagado" });
});

app.post("/motores/on", (req, res) => {
  console.log("🚁 [DEBUG] Encendiendo motores");

  // Send command to all connected Esp32
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      const command = JSON.stringify({
        type: "command",
        payload: { motors: true },
      });
      client.send(command);
      console.log(`📤 Enviando comando MOTORES ON al ESP32: ${command}`);
    }
  });
  io.emit("motors", { motors: true });

  res.json({ motors: true, message: "Motores encendidos" });
});

app.post("/motores/off", (req, res) => {
  console.log("🚁 [DEBUG] Apagando motores");

  // Send command to all connected Esp32
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      const command = JSON.stringify({
        type: "command",
        payload: { motors: false },
      });
      client.send(command);
      console.log(`📤 Enviando comando MOTORES OFF al ESP32: ${command}`);
    }
  });

  io.emit("motors", { motors: false });

  res.json({ motors: false, message: "Motores apagados" });
});

app.get("/api/devices", (req, res) => {
  res.json(Object.values(dispositivosConectados));
});

app.post("/led/on/:id", (req, res) => {
  const id = req.params.id;
  const ws = esp32Sockets[id];
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "command", payload: { led: true } }));
    res.json({ ok: true, message: `LED encendido en ${id}` });
  } else {
    res.status(404).json({ ok: false, message: `ESP32 ${id} no conectado` });
  }
});

app.get("/api/profile/:id", (req, res) => {
  const id = req.params.id;
  const defaultProfile = {
    nombre: "",
    descripcion: "",
    propietario: "",
    fechaCreacion: new Date().toISOString(),
    editable: true,
    // You can add more fields if you wish
  };
  res.json({ id, profile: defaultProfile });
});

app.get("/api/flights/:id", (req, res) => {
  const id = req.params.id;
  res.json({ id, flights: [] });
});

app.use(
  "/",
  createSimulationRouter({
    simState,
    io,
  })
);

app.use(
  "/",
  createRecordingRouter({
    io,
    espNamespace: null,
    wss,
    esp32Socket: null,
    state,
  })
);

configureWebRTC(io);

io.on("connection", (socket) => {
  handleSocketConnection(socket, state);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor escuchando en http://0.0.0.0:${PORT}`);
});

export { io, wss, state };
