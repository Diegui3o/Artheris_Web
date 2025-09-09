import express from "express";
import {
  finalizeStaleFlights,
  listRecentFlights,
  insertNewFlight,
  insertSensorData,
  printLastSensorData,
  updateFlightEndTime,
} from "../server/questdb.js";
export default function createRecordingRouter({
  io,
  espNamespace,
  wss,
  esp32Socket,
  state,
}) {
  const router = express.Router();

  let currentFlightId = null;
  let recordingTimeout = null;
  let recordingStartTime = null;
  let recordingDuration = 30000; // Default 30 seconds
  let latestData = null;
  let modo = "manual";
  let simControl = {};
  let simMode = false;
  let simHistory = [];

  // Middleware to handle errors
  function errorHandler(err, req, res, next) {
    console.error(err.stack);
  }

  // Start new recording
  router.post("/start-recording", async (req, res) => {
    try {
      await finalizeStaleFlights(3000);
      if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
      }

      const { Kc, Ki, mass, armLength, durationMs } = req.body || {};
      const isIndefinite = durationMs === undefined || durationMs === null;

      if (!isIndefinite) {
        if (typeof durationMs === "number" && durationMs > 0) {
          recordingDuration = durationMs;
        } else {
          return res.status(400).json({ error: "Invalid duration parameter" });
        }
      }

      if (!Kc || typeof Kc !== "object" || Object.keys(Kc).length < 6) {
        return res
          .status(400)
          .json({ error: "Incomplete or invalid Kc parameters" });
      }
      if (!Ki || typeof Ki !== "object" || Object.keys(Ki).length < 3) {
        return res
          .status(400)
          .json({ error: "Incomplete or invalid Ki parameters" });
      }
      if (typeof mass !== "number" || isNaN(mass)) {
        return res.status(400).json({ error: "Mass parameter invalid" });
      }
      if (typeof armLength !== "number" || isNaN(armLength)) {
        return res.status(400).json({ error: "Parameter armLength invalid" });
      }

      const flightId = await insertNewFlight(Kc, Ki, mass, armLength);

      currentFlightId = flightId;
      state.isRecording = true;
      state.flightId = flightId;
      recordingStartTime = Date.now();

      if (!isIndefinite) {
        if (recordingTimeout) {
          clearTimeout(recordingTimeout);
          recordingTimeout = null;
        }
        recordingTimeout = setTimeout(async () => {
          try {
            await updateFlightEndTime(currentFlightId);
          } catch (e) {
            console.error(e);
          }
          currentFlightId = null;
          state.isRecording = false;
          state.flightId = null;
          recordingStartTime = null;
          recordingTimeout = null;
        }, recordingDuration);
      }

      res.json({
        message: isIndefinite
          ? "Indefinite recording started"
          : "Recording initiated",
        active: true,
        flightId,
        durationMs: isIndefinite ? null : recordingDuration, // <- NUMÉRICO o null
        isIndefinite,
      });
    } catch (err) {
      console.error("Error in /start-recording:", err);
      res.status(500).json({
        error: "Internal error in /start-recording",
        details: err.message,
      });
    }
  });

  router.get("/recent-flights", async (req, res) => {
    try {
      await finalizeStaleFlights(3000);
      const limit = Number(req.query.limit) || 10;
      const flights = await listRecentFlights(limit);
      // Devuelve lo que la UI espera (flight_id, start_time, end_time, mass)
      const rows = (flights || []).map((r) => ({
        flight_id: r.flight_id,
        start_time: r.start_time,
        end_time: r.end_time,
        mass: r.mass,
        status: r.end_time ? "completed" : "recording", // útil para pintar
      }));
      return res.json(rows);
    } catch (e) {
      //console.error("/recording/recent-flights error:", e);
      return res.status(500).json({
        ok: false,
        error: "recent_flights_failed",
        message: e.message,
      });
    }
  });

  // Endpoint to get current recording status
  router.get("/recording-status", (req, res) => {
    let remainingMs = 0;
    let isActive = !!currentFlightId;

    if (recordingStartTime) {
      const elapsed = Date.now() - recordingStartTime;
      remainingMs = Math.max(0, recordingDuration - elapsed);

      if (recordingTimeout && remainingMs <= 0) {
        currentFlightId = null;
        state.isRecording = false;
        state.flightId = null;
        recordingStartTime = null;
        isActive = false;
      }
    }

    res.json({
      active: isActive,
      flightId: currentFlightId,
      remainingMs: isActive ? remainingMs : 0,
      durationMs: recordingStartTime ? recordingDuration : 0,
    });
  });

  // Endpoint to stop recording
  router.post("/stop-recording", async (req, res) => {
    try {
      const wasRecording = !!currentFlightId;
      const flightIdToReturn = currentFlightId;

      if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
      }
      if (flightIdToReturn) {
        try {
          await updateFlightEndTime(flightIdToReturn);
        } catch (err) {
          console.error(err);
        }
      }

      currentFlightId = null;
      state.isRecording = false;
      state.flightId = null;
      recordingStartTime = null;
      res.json({
        success: true,
        active: false, // <- añade esto
        wasRecording,
        flightId: flightIdToReturn,
        message: wasRecording
          ? "Recording stopped successfully"
          : "No active recording to stop",
      });
    } catch (err) {
      console.error("Error in /stop-recording:", err);
      res.status(500).json({
        success: false,
        error: "Failed to stop recording",
        details: err.message,
      });
    }
  });

  router.get("/debug/latest-data", (req, res) => {
    res.json({
      currentFlightId,
      latestData,
      modo,
    });
  });
  router.get("/debug/sensor-data/json", async (req, res) => {
    try {
      const result = await printLastSensorData(10, true);
      res.json({ data: result });
    } catch (err) {
      res.status(500).json({ error: "Error when consulting sensor_data" });
    }
  });

  // Handle telemetry data and save in Questdb if there is an active flight
  if (io) {
    io.on("connection", (socket) => {
      socket.on("telemetria", (data) => {
        latestData = data;
        modo = data.modo ?? modo;
        if (typeof broadcastData === "function") broadcastData(data);
        handleTelemetry(data);
      });

      socket.on("message", (data) => {
        try {
          const parsedData = typeof data === "string" ? JSON.parse(data) : data;
          if (parsedData.type === "telemetria" && parsedData.payload) {
            const sensorData = parsedData.payload;
            latestData = sensorData;
            modo = sensorData.modo ?? modo;
            if (typeof broadcastData === "function") broadcastData(sensorData);
            handleTelemetry(sensorData);
          }
        } catch (error) {
          console.error("Error processing data in the main socket:", error);
        }
      });
    });
  }

  if (espNamespace) {
    // Handle ESP32 and keep in Questdb if there is an active flight
    espNamespace.on("connection", (socket) => {
      socket.on("message", (data) => {
        try {
          const parsedData = typeof data === "string" ? JSON.parse(data) : data;
          if (parsedData.type === "telemetria" && parsedData.payload) {
            const sensorData = parsedData.payload;
            latestData = sensorData;
            modo = sensorData.modo ?? modo;
            if (typeof broadcastData === "function") broadcastData(sensorData);
            handleTelemetry(sensorData);
          } else if (parsedData.type === "state") {
            if (parsedData.payload && parsedData.payload.mode !== undefined) {
              modo = parsedData.payload.mode;
              if (io) io.emit("modo", modo);
            }
          }
        } catch (error) {
          console.error("Error processing ESP32:", error);
          console.error("Original message:", data);
        }
      });
    });
  }

  router.get("/recording-status", (req, res) => {
    let remainingMs = 0;
    let isActive = !!currentFlightId;

    if (recordingStartTime) {
      const elapsed = Date.now() - recordingStartTime;
      remainingMs = Math.max(0, recordingDuration - elapsed);

      // Only update state if we have a timeout (not indefinite recording)
      if (recordingTimeout && remainingMs <= 0) {
        // Recording finished by timeout
        currentFlightId = null;
        state.isRecording = false;
        state.flightId = null;
        recordingStartTime = null;
        isActive = false;
      }
    }

    res.json({
      active: isActive,
      flightId: currentFlightId,
      remainingMs: isActive ? remainingMs : 0,
      durationMs: recordingDuration,
      lastDataReceived: latestData ? new Date() : null,
      esp32Connected: !!esp32Socket,
      wsConnections: wss ? wss.clients.size : 0,
    });
  });

  return router;
}
