import express, { json } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { envs } from './config/env.js';
import { Server } from 'socket.io';
import sensorRoutes from './server/server.js';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { insertNewFlight, insertSensorData, printLastSensorData } from './server/questdb.js';

const app = express();
const server = createServer(app);

// Configuración de IP fija esperada del ESP32
const ESP32_IP = '192.168.1.200';
let recordingTimeout;
const wss = new WebSocketServer({ server, path: '/esp32' });

app.get('/connections', (req, res) => {
    res.json({
        esp32: {
            connected: !!esp32Socket,
            ip: ESP32_IP
        },
        webSockets: {
            clients: wss.clients.size,
            path: '/esp32'
        },
        socketIO: {
            connections: io.engine.clientsCount
        }
    });
});
wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress.replace('::ffff:', '');
    console.log(`✅ Dispositivo conectado desde IP: ${clientIP}`);

    if (clientIP === ESP32_IP) {
        console.log('✔️ Conexión ESP32 confirmada');
        esp32Socket = ws;
    }
    ws.on('message', async (message) => {
        try {
            //console.log('📩 Mensaje recibido del ESP32:', message.toString());
            const data = JSON.parse(message.toString());
            if (data.type === "telemetria" && data.payload) {
                // 1. Reenviar a todos los clientes de Socket.IO
                io.emit("datosCompleto", {
                    AngleRoll: data.payload.AngleRoll,
                    AnglePitch: data.payload.AnglePitch,
                    AngleYaw: data.payload.AngleYaw,
                    roll: data.payload.AngleRoll,
                    pitch: data.payload.AnglePitch,
                    yaw: data.payload.AngleYaw,
                    RateRoll: data.payload.RateRoll,
                    RatePitch: data.payload.RatePitch,
                    RateYaw: data.payload.RateYaw,
                    AccX: data.payload.AccX,
                    AccY: data.payload.AccY,
                    AccZ: data.payload.AccZ,
                    tau_x: data.payload.tau_x,
                    tau_y: data.payload.tau_y,
                    tau_z: data.payload.tau_z,
                    KalmanAngleRoll: data.payload.KalmanAngleRoll,
                    KalmanAnglePitch: data.payload.KalmanAnglePitch,
                    error_phi: data.payload.error_phi,
                    error_theta: data.payload.error_theta,
                    InputThrottle: data.payload.InputThrottle,
                    InputRoll: data.payload.InputRoll,
                    InputPitch: data.payload.InputPitch,
                    InputYaw: data.payload.InputYaw,
                    MotorInput1: data.payload.MotorInput1,
                    MotorInput2: data.payload.MotorInput2,
                    MotorInput3: data.payload.MotorInput3,
                    MotorInput4: data.payload.MotorInput4,
                    Altura: data.payload.Altura,
                    modo: data.payload.modo,
                    time: new Date().toISOString(),
                    ...data.payload
                });
                io.emit("angles", {
                    roll: data.payload.AngleRoll,
                    pitch: data.payload.AnglePitch,
                    yaw: data.payload.AngleYaw,
                    KalmanAngleRoll: data.payload.KalmanAngleRoll,
                    KalmanAnglePitch: data.payload.KalmanAnglePitch,
                    complementaryAngleRoll: data.payload.complementaryAngleRoll,
                    complementaryAnglePitch: data.payload.complementaryAnglePitch,
                    tau_x: data.payload.tau_x,
                    tau_y: data.payload.tau_y,
                    tau_z: data.payload.tau_z,
                    error_phi: data.payload.error_phi,
                    error_theta: data.payload.error_theta,
                    ...data.payload
                });
                // 2. Guardar en QuestDB si hay grabación activa
                if (currentFlightId) {
                    await insertSensorData(data.payload, currentFlightId);
                } else {
                    //console.log('⚠️ Datos recibidos pero no hay grabación activa');
                }
            }
        } catch (err) {
            console.error('❌ Error procesando mensaje:', err);
        }
    });
    ws.on('close', () => {
        console.log('❌ ESP32 desconectado');
    });
});

// Configurar middlewares
app.use(cors({
    origin: '*', // Permitir todos los orígenes (incluyendo ESP32)
    methods: ['GET', 'POST'],
}));
app.use(json());

// Log all requests and their status codes for debugging (MOVER ARRIBA)
app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode}`);
    });
    next();
});

// Rutas
app.use('/api/sensor', sensorRoutes);

// Middleware para verificar IP del ESP32 - TEMPORALMENTE DESACTIVADO
const checkESP32IP = (socket, next) => {
    const clientIP = socket.handshake.address;
    const clientPort = socket.handshake.port;
    const headers = socket.handshake.headers;

    console.log(`📡 Intento de conexión desde IP: ${clientIP}, Puerto: ${clientPort}`);
    console.log(`📝 User-Agent: ${headers['user-agent'] || 'No disponible'}`);

    // Temporalmente permitimos todas las conexiones para depuración
    console.log('✅ Conexión autorizada (verificación IP desactivada temporalmente)');
    next();
};

// Inicializar Socket.IO con opción adicional de transporte
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Añade estas configuraciones:
    serveClient: false,
    pingTimeout: 30000,  // 30 segundos
    pingInterval: 5000,  // 5 segundos
    cookie: false,
    transports: ['websocket', 'polling']
});

// Configurar namespace específico para ESP32
const espNamespace = io.of('/ws');

// Puerto del servidor
const PORT = envs.PORT || 3002;

let modo = 1;
let latestData = {};
let esp32Socket = null; // Para mantener referencia al socket del ESP32
let currentFlightId = null; // Para rastrear el vuelo activo

// Configurar middleware de verificación IP para el namespace ESP32
espNamespace.use(checkESP32IP);

// Manejar conexiones de clientes web
io.on('connection', (socket) => {
    const clientIP = socket.handshake.address;
    console.log(`🛰️ Cliente WebSocket conectado desde ${clientIP}`);

    // Verificar si es posiblemente el ESP32 por su IP
    if (clientIP === `::ffff:${ESP32_IP}` || clientIP === ESP32_IP) {
        console.log('👍 Posible conexión de ESP32 detectada en socket.io principal');
        esp32Socket = socket; // También guardar referencia aquí
    }

    socket.emit('modo', modo);

    socket.on('telemetria', (data) => {
        latestData = data;
        modo = data.modo ?? modo;
        broadcastData(data);
        handleTelemetry(data); // Guardar datos de telemetría en QuestDB
    });

    // También manejar formato de mensajes del ESP32 aquí
    socket.on('message', (data) => {
        try {
            console.log('📨 Mensaje recibido en socket principal:', typeof data);
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

            if (parsedData.type === 'telemetria' && parsedData.payload) {
                console.log('📊 Datos de telemetría recibidos en socket principal');
                const sensorData = parsedData.payload;
                latestData = sensorData;
                modo = sensorData.modo ?? modo;
                broadcastData(sensorData);
                handleTelemetry(sensorData); // Guardar datos de telemetría en QuestDB
            }
        } catch (error) {
            console.error('Error procesando datos en socket principal:', error);
        }
    });
});

// Manejar conexiones ESP32
espNamespace.on('connection', (socket) => {
    console.log('✅ Cliente ESP32 autorizado y conectado');
    esp32Socket = socket; // Guardar referencia al socket del ESP32

    socket.emit('modo', modo);

    // Manejar datos de telemetría del ESP32
    socket.on('message', (data) => {
        try {
            console.log('📩 Mensaje ESP32 recibido:', typeof data);
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

            if (parsedData.type === 'telemetria' && parsedData.payload) {
                const sensorData = parsedData.payload;
                console.log('📊 Datos de telemetría procesados:', Object.keys(sensorData).join(', '));
                latestData = sensorData;
                modo = sensorData.modo ?? modo;

                broadcastData(sensorData);
                handleTelemetry(sensorData); // Guardar datos de telemetría en QuestDB
            } else if (parsedData.type === 'state') {
                console.log('🔄 Estado del ESP32 recibido:', parsedData.payload);
                if (parsedData.payload && parsedData.payload.mode !== undefined) {
                    modo = parsedData.payload.mode;
                    io.emit('modo', modo);
                }
            }
        } catch (error) {
            console.error('Error procesando datos del ESP32:', error);
            console.error('Mensaje original:', data);
        }
    });

    // Responder a los eventos del ESP32
    socket.on('error', (error) => {
        console.error('❌ Error en conexión de ESP32:', error);
    });

    socket.on('disconnect', () => {
        console.log('❌ Cliente ESP32 desconectado');
        esp32Socket = null;
    });
});

// Función para difundir datos a todos los clientes
const broadcastData = (sensorData) => {
    io.emit('sensorData', {
        time: new Date().toISOString(),
        value: sensorData.AngleRoll,
        pitch: sensorData.AnglePitch,
    });

    io.emit('angles', sensorData);
};

// Actualizar modo y notificar a todos los clientes
const updateMode = (newMode) => {
    if (modo !== newMode) {
        modo = newMode;
        io.emit('modo', modo);

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

        console.log(`📢 Modo cambiado a: ${modo}`);
    }
};

// Endpoints para control (actualizados para formatos compatibles con ESP32)
app.get('/led/on', (req, res) => {
    io.emit('control', 'ON_LED');
    if (esp32Socket) {
        const command = {
            type: "command",
            payload: {
                led: true
            }
        };
        esp32Socket.emit('message', JSON.stringify(command));
    }
    // También reenviar por WebSocket puro si hay clientes
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: "command", payload: { led: true } }));
        }
    });
    res.json({ message: "LED encendido" });
});

app.get('/led/off', (req, res) => {
    io.emit('control', 'OFF_LED');
    if (esp32Socket) {
        const command = {
            type: "command",
            payload: {
                led: false
            }
        };
        esp32Socket.emit('message', JSON.stringify(command));
    }
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: "command", payload: { led: false } }));
        }
    });
    res.json({ message: "LED apagado" });
});

app.get('/motores/on', (req, res) => {
    io.emit('control', 'ON_MOTORS');
    if (esp32Socket) {
        const command = {
            type: "command",
            payload: {
                motors: true
            }
        };
        esp32Socket.emit('message', JSON.stringify(command));
    }
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: "command", payload: { motors: true } }));
        }
    });
    res.json({ message: 'MOTORES ENCENDIDOS' });
});

app.get('/motores/off', (req, res) => {
    io.emit('control', 'OFF_MOTORS');
    if (esp32Socket) {
        const command = {
            type: "command",
            payload: {
                motors: false
            }
        };
        esp32Socket.emit('message', JSON.stringify(command));
    }
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: "command", payload: { motors: false } }));
        }
    });
    res.json({ message: 'MOTORES APAGADOS' });
});

app.get('/modo/:numero', (req, res) => {
    const nuevoModo = parseInt(req.params.numero);
    if (![0, 1, 2].includes(nuevoModo)) {
        return res.status(400).json({ error: 'Modo inválido. Usa 0, 1 o 2' });
    }
    updateMode(nuevoModo);
    // También reenviar por WebSocket puro si hay clientes
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: "command", payload: { mode: nuevoModo } }));
        }
    });
    res.json({ message: `Modo actual: ${modo}` });
});

app.post('/start-recording', async (req, res) => {
    try {
        // Limpiar timeout anterior si existe
        if (recordingTimeout) clearTimeout(recordingTimeout);

        const { Kc, Ki, mass, armLength } = req.body || {};
        const flightId = await insertNewFlight(Kc, Ki, mass, armLength);
        currentFlightId = flightId;

        // Configurar timeout (20 segundos)
        recordingTimeout = setTimeout(() => {
            console.log('⏱️ Grabación detenida por timeout');
            currentFlightId = null;
        }, 20000); // 20,000 ms = 20 segundos

        res.json({
            message: 'Grabación iniciada',
            flightId,
            recordingDuration: '30 segundos'
        });

    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para detener la grabación
app.post('/stop-recording', (req, res) => {
    currentFlightId = null;
    res.json({ message: 'Grabación detenida' });
});

// En cada recepción de telemetría, guardar en QuestDB si hay un vuelo activo
function handleTelemetry(sensorData) {
    if (!currentFlightId) {
        console.log('⚠️ Telemetría recibida SIN grabación activa');
        return;
    }
    insertSensorData(sensorData, currentFlightId)
        //.then(() => console.log('✅ Datos guardados en QuestDB'))
        .catch(err => console.error('❌ Error guardando datos:', err));
}

// Endpoint temporal para depuración: ver últimos datos guardados
app.get('/debug/latest-data', (req, res) => {
    res.json({
        currentFlightId,
        latestData,
        modo
    });
});

// Endpoint temporal para depuración: ver últimos datos guardados (JSON)
app.get('/debug/sensor-data/json', async (req, res) => {
    try {
        const result = await printLastSensorData(10, true); // true = return rows
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: 'Error al consultar sensor_data' });
    }
});

// Manejar datos de telemetría y guardar en QuestDB si hay un vuelo activo
io.on('connection', (socket) => {
    socket.on('telemetria', (data) => {
        //console.log('[DEBUG] Evento telemetria recibido (io.on):', data);
        latestData = data;
        modo = data.modo ?? modo;
        broadcastData(data);
        handleTelemetry(data);
    });

    socket.on('message', (data) => {
        try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsedData.type === 'telemetria' && parsedData.payload) {
                //console.log('[DEBUG] Evento telemetria recibido (io.on message):', parsedData.payload);
                const sensorData = parsedData.payload;
                latestData = sensorData;
                modo = sensorData.modo ?? modo;
                broadcastData(sensorData);
                handleTelemetry(sensorData);
            }
        } catch (error) {
            console.error('Error procesando datos en socket principal:', error);
        }
    });
});

// Manejar conexiones ESP32 y guardar en QuestDB si hay un vuelo activo
espNamespace.on('connection', (socket) => {
    socket.on('message', (data) => {
        try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsedData.type === 'telemetria' && parsedData.payload) {
                //console.log('[DEBUG] Evento telemetria recibido (espNamespace):', parsedData.payload);
                const sensorData = parsedData.payload;
                latestData = sensorData;
                modo = sensorData.modo ?? modo;
                broadcastData(sensorData);
                handleTelemetry(sensorData);
            } else if (parsedData.type === 'state') {
                if (parsedData.payload && parsedData.payload.mode !== undefined) {
                    modo = parsedData.payload.mode;
                    io.emit('modo', modo);
                }
            }
        } catch (error) {
            console.error('Error procesando datos del ESP32:', error);
            console.error('Mensaje original:', data);
        }
    });
});

app.get('/recording-status', (req, res) => {
    res.json({
        isRecording: !!currentFlightId,
        flightId: currentFlightId,
        lastDataReceived: latestData ? new Date() : null,
        esp32Connected: !!esp32Socket,
        wsConnections: wss.clients.size
    });
});

// Resto de endpoints y manejo de errores...
app.get('/modo/actual', (req, res) => {
    console.log('🔎 [DEBUG] GET /modo/actual called');
    res.json({ modo });
});

// Catch-all 404 handler for unknown routes
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not found' });
});

// Global error handler (should be last)
app.use((err, req, res, next) => {
    console.error('❌ Error del servidor:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor Express corriendo en http://localhost:${PORT}`);
    console.log(`🛰️ Esperando conexión del ESP32 en IP: ${ESP32_IP}`);
    console.log(`📝 Nota: Verificación de IP temporalmente desactivada para depuración`);
});