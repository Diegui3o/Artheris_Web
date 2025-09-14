export function handleSocketConnection(socket, state) {
  socket.emit("status", {
    isRecording: state.isRecording,
    isSimulating: state.isSimulating,
    flightId: state.flightId,
  });

  socket.emit("sensorUpdate", state.latestTelemetry);

  // Ingesta centralizada: guarda en memoria, emite a clientes y persiste si hay grabación
  state.ingestTelemetry = async (data) => {
    try {
      state.latestTelemetry = data;
      socket.server.emit("sensorUpdate", data);

      if (state.isRecording && state.flightId) {
        const { insertSensorData } = await import("../server/questdb.js");
        await insertSensorData(data, state.flightId);
        // console.log(`💾 Saved telemetry to flight ${state.flightId}`);
      }

      // buffer en memoria (opcional)
      state.telemetries = state.telemetries || [];
      state.telemetries.push(data);
      if (state.telemetries.length > 100) state.telemetries.shift();
    } catch (err) {
      console.error("❌ ingestTelemetry failed:", err);
    }
  };

  // Escucha TODOS los formatos que podrían llegarte y redirígelos a ingestTelemetry
  socket.on("Telemetry", (data) => state.ingestTelemetry(data));
  socket.on("telemetria", (data) => state.ingestTelemetry(data));
  socket.on("message", (raw) => {
    try {
      const d = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (d?.type === "telemetria" && d.payload)
        return state.ingestTelemetry(d.payload);
      if (d?.type === "Telemetry" && d.payload)
        return state.ingestTelemetry(d.payload);
      // Si ya viene el objeto directo:
      if (d?.KalmanAngleRoll !== undefined || d?.AngleRoll !== undefined) {
        return state.ingestTelemetry(d);
      }
    } catch (e) {
      console.error("❌ Error parsing socket 'message':", e);
    }
  });

  // Allow the backend to emit telemetry to all customers easily
  state.emitTelemetry = (telemetry) => {
    state.latestTelemetry = telemetry;
    socket.server.emit("sensorUpdate", telemetry);
  };

  socket.on("getLatest", () => {
    socket.emit("telemetry", state.latestTelemetry);
  });

  socket.on("toggleSim", (val) => {
    state.isSimulating = val;
    socket.broadcast.emit("toggleSim", val);
  });

  socket.on("command", (cmd) => {
    socket.broadcast.emit("command", cmd);
  });

  socket.on("led", (val) => {
    socket.broadcast.emit("led", val);
  });

  socket.on("motors", (val) => {
    socket.broadcast.emit("motors", val);
  });

  // Receive telemetry data from ESP32 (Websocket)
  socket.on("Telemetry", async (data) => {
    console.log("📡 Telemetry received from ESP32");
    console.log("📊 Telemetry data structure:", JSON.stringify(data, null, 2));
    state.latestTelemetry = data;
    socket.server.emit("sensorUpdate", data);

    // Save telemetry to database if recording is active
    if (state.isRecording && state.flightId) {
      try {
        const { insertSensorData } = await import("../server/questdb.js");
        await insertSensorData(data, state.flightId);
        console.log(`💾 Saved telemetry to flight ${state.flightId}`);
      } catch (error) {
        console.error("❌ Error saving telemetry to database:", error);
      }
    }

    // Keep the last 100 telemetries in memory
    if (state.isRecording) {
      state.telemetries = state.telemetries || [];
      state.telemetries.push(data);
      if (state.telemetries.length > 100) {
        state.telemetries.shift();
      }
    }
  });
}
