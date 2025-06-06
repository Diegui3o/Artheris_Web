import { io, wss } from "../index.js";

// Logic function to update mode
const updateMode = (newMode, esp32Socket, modoRef) => {
    if (modoRef.value !== newMode) {
        modoRef.value = newMode;
        io.emit('modo', modoRef.value);

        // Enviar comando específico al ESP32 si está conectado
        if (esp32Socket) {
            // Formato JSON que el ESP32 puede procesar
            const modeCommand = {
                type: "command",
                payload: {
                    mode: newMode
                }
            };
            console.log('📤 Enviando comando de modo al ESP32:', modeCommand);
            esp32Socket.emit('message', JSON.stringify(modeCommand));
        }

        console.log(`📢 Modo cambiado a: ${modoRef.value}`);
    }
};

// Logic function to set LED state on all ESP32 clients
const setLedState = (ledOn, wss, io) => {
    // Send LED command to all ESP32 WebSocket clients in the format ESP32 expects
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'command', payload: { led: ledOn } }));
        }
    });
    // Emit to all web clients as well
    io.emit('led', { led: ledOn });
    console.log(`📤 Enviando comando de LED al ESP32: ${ledOn ? 'ON' : 'OFF'}`);
};

// Logic function to set motor state on all ESP32 clients
const setMotorsState = (motorsOn, wss, io) => {
    // Send motor command to all ESP32 WebSocket clients in the format ESP32 expects
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'command', payload: { motors: motorsOn } }));
        }
    });
    // Emit to all web clients as well
    io.emit('motors', { motors: motorsOn });
    console.log(`📤 Enviando comando de MOTORES al ESP32: ${motorsOn ? 'ON' : 'OFF'}`);
};

// Logic function to set mode on all ESP32 clients
const setMode = (mode, wss, io) => {
    // Send mode command to all ESP32 WebSocket clients in the format ESP32 expects
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'command', payload: { mode } }));
        }
    });
    // Emit to all web clients as well
    io.emit('modo', mode);
    console.log(`📤 Enviando comando de MODO al ESP32: ${mode}`);
};

// Export only logic functions
export { updateMode, setLedState, setMotorsState, setMode };