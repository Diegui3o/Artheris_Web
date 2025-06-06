// socketHandler.js
export function handleSocketConnection(socket, state) {
    console.log('Cliente conectado');

    socket.emit('status', {
        isRecording: state.isRecording,
        isSimulating: state.isSimulating,
        flightId: state.flightId,
    });

    // Emitir la última telemetría al conectar
    socket.emit('sensorUpdate', state.latestTelemetry);

    // Permitir que el backend emita telemetría a todos los clientes fácilmente
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

    // Recibir datos de telemetría desde el ESP32 (WebSocket)
    socket.on('telemetria', (data) => {
        console.log("Telemetría recibida del ESP32:", data);
        state.latestTelemetry = data;
        // Emitir a todos los clientes web conectados
        socket.server.emit('sensorUpdate', data);
        // Guardar si está grabando
        if (state.isRecording) state.telemetries.push(data);
    });
}
