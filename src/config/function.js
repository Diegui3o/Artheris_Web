import { io, wss } from "../index.js";

// Logic function to update mode
const updateMode = (newMode, esp32Socket, modoRef) => {
    if (modoRef.value !== newMode) {
        modoRef.value = newMode;
        io.emit('modo', modoRef.value);

        // Send specific command to ESP32 if you are connected
        if (esp32Socket) {
            const modeCommand = {
                type: "command",
                payload: {
                    mode: newMode
                }
            };
            console.log('📤 Senting Mode to ESP32:', modeCommand);
            esp32Socket.emit('message', JSON.stringify(modeCommand));
        }

        console.log(`📢 Changed mode to: ${modoRef.value}`);
    }
};

// Logic function to set LED state on all ESP32 clients
const setLedState = (ledOn, wss, io) => {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'command', payload: { led: ledOn } }));
        }
    });
    // Emit to all web clients as well
    io.emit('led', { led: ledOn });
    console.log(`📤 Sending LED command to ESP32: ${ledOn ? 'ON' : 'OFF'}`);
};

// Logic function to set motor state on all ESP32 clients
const setMotorsState = (motorsOn, wss, io) => {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'command', payload: { motors: motorsOn } }));
        }
    });
    // Emit to all web clients as well
    io.emit('motors', { motors: motorsOn });
    console.log(`📤 Senting Motors Command to ESP32: ${motorsOn ? 'ON' : 'OFF'}`);
};

// Logic function to set mode on all ESP32 clients
const setMode = (mode, wss, io) => {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'command', payload: { mode } }));
        }
    });
    io.emit('modo', mode);
    console.log(`📤 Senting MODE to ESP32: ${mode}`);
};

export { updateMode, setLedState, setMotorsState, setMode };