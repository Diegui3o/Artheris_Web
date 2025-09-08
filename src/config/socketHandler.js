export function handleSocketConnection(socket, state) {
    console.log('Customer connected');

    socket.emit('status', {
        isRecording: state.isRecording,
        isSimulating: state.isSimulating,
        flightId: state.flightId,
    });

    // Issue the last telemetry when connecting
    socket.emit('sensorUpdate', state.latestTelemetry);

    // Allow the backend to emit telemetry to all customers easily
    state.emitTelemetry = (telemetry) => {
        state.latestTelemetry = telemetry;
        socket.server.emit('sensorUpdate', telemetry);
    };

    socket.on('getLatest', () => {
        socket.emit('telemetry', state.latestTelemetry);
    });

    socket.on('toggleSim', (val) => {
        state.isSimulating = val;
        socket.broadcast.emit('toggleSim', val);
    });

    socket.on('command', (cmd) => {
        socket.broadcast.emit('command', cmd);
    });

    socket.on('led', (val) => {
        socket.broadcast.emit('led', val);
    });

    socket.on('motors', (val) => {
        socket.broadcast.emit('motors', val);
    });

    // Receive telemetry data from ESP32 (Websocket)
    socket.on('Telemetry', async (data) => {
        console.log("📡 Telemetry received from ESP32");
        console.log("📊 Telemetry data structure:", JSON.stringify(data, null, 2));
        state.latestTelemetry = data;
        socket.server.emit('sensorUpdate', data);
        
        // Save telemetry to database if recording is active
        if (state.isRecording && state.flightId) {
            try {
                const { insertSensorData } = await import('../server/questdb.js');
                await insertSensorData(data, state.flightId);
                console.log(`💾 Saved telemetry to flight ${state.flightId}`);
            } catch (error) {
                console.error('❌ Error saving telemetry to database:', error);
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
