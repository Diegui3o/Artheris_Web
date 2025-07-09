export function handleSocketConnection(socket, state) {
    console.log('Cliente conectado');

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

    // Receive telemetry data from ESP32 (Websockt)
    socket.on('telemetria', (data) => {
        console.log("Telemetría recibida del ESP32:", data);
        state.latestTelemetry = data;
        socket.server.emit('sensorUpdate', data);
        if (state.isRecording) state.telemetries.push(data);
    });
}
