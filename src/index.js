import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { WebSocketServer } from "ws";
import { handleSocketConnection } from "./config/socketHandler.js";
import createSimulationRouter from "./config/st_simulation.js";
import createRecordingRouter from "./config/recording.js";
import { finalizeStaleFlights } from "./server/questdb.js";
import {
  insertSensorData,
  checkQuestDBConnection,
  pool,
} from "./server/questdb.js";
import { configureWebRTC } from "./config/webrtc.js";
import createDataMetricsRouter from "./data/metrics_router.js";

const app = express();
const PORT = 3002;

// Initialize state with default values
export let state = {
  isRecording: false,
  isSimulating: false,
  flightId: null,
  latestTelemetry: {},
  telemetries: [],
  // Add other default state properties as needed
};
setInterval(() => finalizeStaleFlights(5000).catch(() => {}), 4000);
app.use(cors());
app.use(express.json());
app.use("/", createDataMetricsRouter({ state }));

app.get("/flight-metrics/:flightId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT timestamp, input_throttle
       FROM sensor_data
       WHERE flight_id = $1
       ORDER BY timestamp ASC`,
      [req.params.flightId]
    );

    let t = 0;
    for (let i = 1; i < rows.length; i++) {
      const t0 = new Date(rows[i - 1].timestamp).getTime() / 1000;
      const t1 = new Date(rows[i].timestamp).getTime() / 1000;
      const dt = Math.max(0, t1 - t0);
      const thr = Number(rows[i].input_throttle) || 0;
      if (thr >= 1300 && thr <= 2000) t += dt;
    }

    res.json({ ok: true, flight_time_seconds: t });
  } catch (e) {
    res
      .status(500)
      .json({
        ok: false,
        error: "flight_metrics_failed",
        message: String(e.message),
      });
  }
});

// Basic endpoints for drone registration and consultation by ID
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

// Register or update dron by ID
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

// Get drone by ID
app.get("/api/drones/:id", (req, res) => {
  const { id } = req.params;
  const drones = readDrones();
  const dron = drones.find((d) => d.id === id);
  if (!dron) return res.status(404).json({ error: "Not found" });
  res.json(dron);
});

// List all drones (optional)
app.get("/api/drones", (req, res) => {
  res.json(readDrones());
});

// Endpoint to obtain connected devices
app.get("/api/devices", (req, res) => {
  res.json(Object.values(dispositivosConectados));
});
export let io = null;
export let wss = null;

const server = http.createServer(app);

// Initialize database connection before starting the server
async function initializeServer() {
  // Track connected devices
  const dispositivosConectados = {};
  try {
    const dbReady = await checkQuestDBConnection();
    if (!dbReady) {
      console.error(
        "❌ Failed to initialize database connection. Server may not function correctly."
      );
    }

    io = new Server(server, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });
    // Server WebSocket for ESP32 (port 3003, path /esp32)
    const wssServer = http.createServer();
    wss = new WebSocketServer({ server: wssServer, path: "/esp32" });

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

    // State is already initialized with default values

    // Mount recording router
    const recordingRouter = createRecordingRouter({
      io,
      wss,
      esp32Socket: null,
      state,
    });
    app.use("/recording", recordingRouter);

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
      const estados = Object.values(dispositivosConectados).map((device) => ({
        id: device.id,
        status: device.conectado ? "connected" : "disconnected",
        nombre: device.nombre || device.id,
      }));
      socket.emit("deviceStatusAll", estados);
    });

    // Variables moved to the beginning of initializeServer function

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
      console.log(`✅ ESP32 connected by websocket from ${clientIP}`);

      // helper: crea un objeto "data" desde un array numérico ya parseado
      function mapValuesToData(values) {
        const getVal = (i) =>
          typeof values[i] === "number" && !Number.isNaN(values[i])
            ? values[i]
            : 0;

        return {
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
          InputThrottle: getVal(17),
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
      }

      // handler unificado por paquete (JSON o CSV ya mapeado)
      function processPacket(data) {
        // usa ws.deviceId si no tenemos identificador en este frame
        const combined = {
          ...data,
          id: ws.deviceId || data.id || null,
          roll: data.AngleRoll ?? data.roll,
          pitch: data.AnglePitch ?? data.pitch,
          yaw: data.AngleYaw ?? data.yaw,
          time: new Date().toISOString(),
        };

        if (typeof data.modo !== "undefined") io.emit("mode", data.modo);
        if (typeof data.led !== "undefined")
          io.emit("led", { led: !!data.led });

        // simulador (igual que tenías)
        if (simState && simState.simMode && simState.simulator) {
          if (
            typeof data.KalmanAngleRoll === "number" &&
            typeof data.KalmanAnglePitch === "number"
          ) {
            const phi_ref = (data.KalmanAngleRoll * Math.PI) / 180;
            const theta_ref = (data.KalmanAnglePitch * Math.PI) / 180;
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
        const MAX_SAMPLES = 10000;
        state.telemetries.push(combined);
        if (state.telemetries.length > MAX_SAMPLES) {
          state.telemetries.splice(0, state.telemetries.length - MAX_SAMPLES);
        }
        if (state.isRecording && state.flightId) {
          insertSensorData(combined, state.flightId).catch((err) =>
            console.error("❌ Error saving data in Questdb:", err)
          );
        }
      }

      ws.on("message", (message) => {
        const raw = message.toString();

        // 1) Intento JSON (objeto o array)
        const trimmed = raw.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const payload = JSON.parse(trimmed);

            // Mensaje de identificación {"id": "..."}
            if (payload && typeof payload === "object" && payload.id) {
              // registra/actualiza device
              const identificador = payload.id;
              if (!ws.deviceId) ws.deviceId = identificador;
              // (tu lógica de dispositivosConectados, emitirEstadoDispositivos, etc.)
            }

            // Si es telemetría simple en JSON:
            if (payload.type === "telemetria" && payload.payload) {
              processPacket(payload.payload);
              return;
            }

            // Si viene como array de paquetes JSON:
            if (Array.isArray(payload)) {
              for (const pkt of payload) processPacket(pkt);
              return;
            }

            // Si es un objeto con campos de telemetría directamente:
            if (payload.AngleRoll !== undefined || payload.roll !== undefined) {
              processPacket(payload);
              return;
            }

            // si es otro tipo de JSON, caemos a CSV parse como fallback
          } catch {
            // no era JSON parseable → seguimos con CSV
          }
        }

        const lines = raw
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);

        // Normaliza cada línea a 27 columnas y procesa
        for (const line of lines) {
          let parts = line.split(",").map((x) => {
            const v = parseFloat(x);
            return Number.isFinite(v) ? v : 0;
          });
          while (parts.length < 27) parts.push(0);
          const data = mapValuesToData(parts);
          processPacket(data);
        }

        // Process each line and ensure it has 27 elements
        const processedLines = lines.map((line) => {
          let parts = line.split(",").map((x) => {
            const v = parseFloat(x);
            return Number.isFinite(v) ? v : 0;
          });
          // Ensure each line has exactly 27 elements
          while (parts.length < 27) parts.push(0);
          return parts;
        });

        // Process the processedLines as needed
        // For example, if you need to access the first line's parts:
        const parts = processedLines[0] || [];
      });

      ws.on("close", () => {
        if (ws.deviceId && dispositivosConectados[ws.deviceId]) {
          delete dispositivosConectados[ws.deviceId];
        }
        if (ws.deviceId && esp32Sockets[ws.deviceId]) {
          delete esp32Sockets[ws.deviceId];
        }
        console.log("❌ ESP32 offline (ws)");
        emitirEstadoDispositivos();
      });
    });

    function clamp(val, min = -5, max = 5) {
      return Math.min(Math.max(val, min), max);
    }

    function clampWithThreshold(val, threshold = 0.01, min = -5, max = 5) {
      if (typeof val !== "number" || isNaN(val)) return 0;
      // If the absolute value is less than the threshold, forcing to zero
      if (Math.abs(val) < threshold) return 0;
      return Math.min(Math.max(val, min), max);
    }

    app.get("/modo/actual", (req, res) => {
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
        return res.status(400).json({
          error: "Invalid mode It must be a number between 0 and 10.",
        });
      }

      console.log(`🔄 [DEBUG] Changing mode a: ${mode}`);

      // Send command to all connected Esp32
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          const command = JSON.stringify({
            type: "command",
            payload: { mode },
          });
          client.send(command);
          console.log(`📤 Senting Mode to ESP32: ${command}`);
        }
      });
      state.latestTelemetry.modo = mode;
      io.emit("modo", mode);

      res.json({ modo: mode, message: `Mode changed to ${mode}` });
    });

    app.post("/recording/finalize-stale", async (req, res) => {
      const { idleSec = 120 } = req.body || {};
      await finalizeStaleFlights(idleSec * 1000);
      res.json({ ok: true });
    });
    app.post("/recording/finalize/:flightId", async (req, res) => {
      await forceCloseFlight(req.params.flightId);
      res.json({ ok: true });
    });
    app.post("/led/on", (req, res) => {
      console.log("💡 [DEBUG] Lighting LED");

      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          const command = JSON.stringify({
            type: "command",
            payload: { led: true },
          });
          client.send(command);
          console.log(`📤 Senting LED On to ESP32: ${command}`);
        }
      });
      io.emit("LED", { led: true });

      res.json({ led: true, message: "LED On" });
    });

    app.post("/led/off", (req, res) => {
      console.log("💡 [DEBUG] Turning off LED");

      // Send command to all connected Esp32
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          const command = JSON.stringify({
            type: "command",
            payload: { led: false },
          });
          client.send(command);
          console.log(`📤 Sending LED off command to ESP32: ${command}`);
        }
      });
      io.emit("LED", { led: false });

      res.json({ led: false, message: "LED off" });
    });

    app.post("/motores/on", (req, res) => {
      console.log("🚁 [DEBUG] Lighting MOTORS");

      // Send command to all connected Esp32
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          const command = JSON.stringify({
            type: "command",
            payload: { motors: true },
          });
          client.send(command);
          console.log(`📤 Senting MOTORS ON to Esp32: ${command}`);
        }
      });
      io.emit("motors", { motors: true });

      res.json({ motors: true, message: "MOTORS ON" });
    });

    app.post("/motores/off", (req, res) => {
      console.log("🚁 [DEBUG] Turning off MOTORS");

      // Send command to all connected Esp32
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          const command = JSON.stringify({
            type: "command",
            payload: { motors: false },
          });
          client.send(command);
          console.log(`📤 Sending command MOTORS OFF to ESP32: ${command}`);
        }
      });

      io.emit("motors", { motors: false });

      res.json({ motors: false, message: "MOTORS OFF" });
    });

    app.get("/api/devices", (req, res) => {
      res.json(Object.values(dispositivosConectados));
    });

    app.post("/led/on/:id", (req, res) => {
      const id = req.params.id;
      const ws = esp32Sockets[id];
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "command", payload: { led: true } }));
        res.json({ ok: true, message: `LED lit on ${id}` });
      } else {
        res
          .status(404)
          .json({ ok: false, message: `ESP32 ${id} not connected` });
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

    configureWebRTC(io);

    io.on("connection", (socket) => {
      handleSocketConnection(socket, state);
    });

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
initializeServer();
