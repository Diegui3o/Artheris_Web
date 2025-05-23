import express, { json } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { envs } from './config/env.js';
import { Server } from 'socket.io';
import sensorRoutes from './server/server.js';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { insertNewFlight, insertSensorData, printLastSensorData } from './server/questdb.js';
import DroneSimulator from './server/simulator.js';

const app = express();
const server = createServer(app);

// Configuración de IP fija esperada del ESP32
const ESP32_IP = '192.168.1.200';
let recordingTimeout;
const wss = new WebSocketServer({ server, path: '/esp32' });

const simulationParams = {
    Ixx: 0.02,
    Iyy: 0.02,
    Izz: 0.04,
    mass: 1.2,
    g: 9.81,
    T: 1.2 * 9.81 // Asegura que T esté definido para la normalización
};
let simulator = null;
let simInterval = null;
let simMode = false; // flag para modo simulación

// Historial de simulación
let simHistory = [];

// --- NUEVO: Variables globales para control desde ESP32 ---
let simControl = {
    T: 9.81,
    tau_x: 0,
    tau_y: 0,
    tau_z: 0
};

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
            const data = JSON.parse(message.toString());
            if (data.type === "angles" && data.payload) {
                lastAngles = data.payload;
            } else if (data.type === "control" && data.payload) {
                lastControl = data.payload;
            } else if (data.type === "motors" && data.payload) {
                lastMotors = data.payload;
            } else if (data.type === "state") {
                if (data.payload && data.payload.mode !== undefined) {
                    modo = data.payload.mode;
                    io.emit('modo', modo);
                }
            }
            // Unificar y emitir el objeto combinado
            const combined = buildCombined();
            latestData = combined;
            modo = combined.modo ?? modo;
            io.emit("datosCompleto", combined);
            io.emit("angles", combined);
            if (currentFlightId) {
                await insertSensorData(combined, currentFlightId);
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

const espNamespace = io.of('/ws');
espNamespace.use(checkESP32IP);

// Middleware para permitir todas las conexiones (puedes personalizarlo para filtrar por IP)
function checkESP32IP(socket, next) {
    // Ejemplo: permitir todas las conexiones
    next();
}

// Manejar conexiones de clientes web
io.on('connection', (socket) => {
    console.log('🔗 Nuevo cliente Socket.IO conectado:', socket.id, 'IP:', socket.handshake.address);

    const clientIP = socket.handshake.address;
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

// --- Buffers para los tres tipos de mensajes del ESP32 ---
let lastAngles = {};
let lastControl = {};
let lastMotors = {};

// Manejar conexiones ESP32
espNamespace.on('connection', (socket) => {
    console.log('✅ Cliente ESP32 autorizado y conectado');
    esp32Socket = socket; // Guardar referencia al socket del ESP32

    socket.emit('modo', modo);

    // Manejar datos de telemetría del ESP32 (ahora multi-bloque)
    socket.on('message', (data) => {
        try {
            console.log('📩 Mensaje ESP32 recibido:', typeof data);
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

            if (parsedData.type === 'angles' && parsedData.payload) {
                lastAngles = parsedData.payload;
            } else if (parsedData.type === 'control' && parsedData.payload) {
                lastControl = parsedData.payload;
            } else if (parsedData.type === 'motors' && parsedData.payload) {
                lastMotors = parsedData.payload;
            } else if (parsedData.type === 'state') {
                console.log('🔄 Estado del ESP32 recibido:', parsedData.payload);
                if (parsedData.payload && parsedData.payload.mode !== undefined) {
                    modo = parsedData.payload.mode;
                    io.emit('modo', modo);
                }
            }
            // Unificar y emitir el objeto combinado
            const combined = buildCombined();
            latestData = combined;
            modo = combined.modo ?? modo;
            io.emit('datosCompleto', combined);
            io.emit('angles', combined);
            handleTelemetry(combined);
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

// WebSocketServer (wss) handler
wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress.replace('::ffff:', '');
    console.log(`✅ Dispositivo conectado desde IP: ${clientIP}`);

    if (clientIP === ESP32_IP) {
        console.log('✔️ Conexión ESP32 confirmada');
        esp32Socket = ws;
    }
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === "angles" && data.payload) {
                lastAngles = data.payload;
            } else if (data.type === "control" && data.payload) {
                lastControl = data.payload;
            } else if (data.type === "motors" && data.payload) {
                lastMotors = data.payload;
            } else if (data.type === "state") {
                if (data.payload && data.payload.mode !== undefined) {
                    modo = data.payload.mode;
                    io.emit('modo', modo);
                }
            }
            // Unificar y emitir el objeto combinado
            const combined = buildCombined();
            latestData = combined;
            modo = combined.modo ?? modo;
            io.emit("datosCompleto", combined);
            io.emit("angles", combined);
            if (currentFlightId) {
                await insertSensorData(combined, currentFlightId);
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

let modo = 1;
let latestData = {};
let esp32Socket = null;
let currentFlightId = null;

// Configurar middleware de verificación IP para el namespace ESP32
espNamespace.use(checkESP32IP);

// Manejar conexiones de clientes web
io.on('connection', (socket) => {
    console.log('🔗 Nuevo cliente Socket.IO conectado:', socket.id, 'IP:', socket.handshake.address);

    const clientIP = socket.handshake.address;
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

// Endpoints para controlar la simulación
app.post('/simulate/control', (req, res) => {
    const { T, tau_x, tau_y, tau_z } = req.body || {};
    if (typeof T === 'number') simControl.T = T;
    if (typeof tau_x === 'number') simControl.tau_x = tau_x;
    if (typeof tau_y === 'number') simControl.tau_y = tau_y;
    if (typeof tau_z === 'number') simControl.tau_z = tau_z;
    res.json({ message: 'Control actualizado', simControl });
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

// Endpoint para saber si la simulación está activa
app.get('/simulate/status', (req, res) => {
    res.json({ simActive: !!simMode });
});

// Endpoint para obtener el historial de la simulación
app.get('/simulate/history', (req, res) => {
    res.json({ history: simHistory });
});

// POST /simulate/start
app.post('/simulate/start', (req, res) => {
    console.log('[DEBUG] POST /simulate/start called. simMode:', simMode, 'IP:', req.ip, 'Body:', req.body);
    if (simMode) {
        console.warn('[WARN] Simulación ya activa. Rejecting new start.');
        return res.status(400).json({ error: 'Simulación ya activa' });
    }
    // Limpia cualquier intervalo previo por seguridad
    if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
        console.log('[INFO] Intervalo de simulación anterior limpiado antes de iniciar uno nuevo.');
    }
    // Actualiza simulationParams con los valores recibidos (si existen)
    if (req.body && typeof req.body === 'object') {
        Object.assign(simulationParams, req.body);
        // Asegura que T esté definido correctamente si mass/g cambian
        if (simulationParams.mass && simulationParams.g) {
            simulationParams.T = simulationParams.mass * simulationParams.g;
        }
    }
    simulator = new DroneSimulator(simulationParams);
    simMode = true;
    simHistory = []; // Reinicia historial al iniciar
    simInterval = setInterval(() => {
        if (!simMode) {
            clearInterval(simInterval);
            simInterval = null;
            return;
        }
        // Usar los valores actuales de simControl
        const T = simControl.T;
        const tau_x = simControl.tau_x;
        const tau_y = simControl.tau_y;
        const tau_z = simControl.tau_z;
        const u = [T, tau_x, tau_y, tau_z];
        const sensor = simulator.step(u, 0.03);
        // --- NUEVO: Llevar tiempo de simulación acumulado ---
        if (!simulator.simTime) simulator.simTime = 0;
        simulator.simTime += 0.03;
        // --- SANITIZE ANGLES BEFORE EMITTING ---
        function sanitizeAngle(val) {
            if (!isFinite(val) || Math.abs(val) > 1e3) return 0;
            // Clamp to [-2π, 2π] radians (about [-360, 360] degrees)
            if (val > 2 * Math.PI) return 2 * Math.PI;
            if (val < -2 * Math.PI) return -2 * Math.PI;
            return val;
        }
        const safeRoll = sanitizeAngle(sensor.roll);
        const safePitch = sanitizeAngle(sensor.pitch);
        const safeYaw = sanitizeAngle(sensor.yaw);
        const simData = {
            AngleRoll: safeRoll,
            AnglePitch: safePitch,
            AngleYaw: safeYaw,
            AccX: sensor.ax,
            AccY: sensor.ay,
            AccZ: sensor.az,
            RateRoll: sensor.gx,
            RatePitch: sensor.gy,
            RateYaw: sensor.gz,
            time: new Date().toISOString(),
            simTime: simulator.simTime, // <-- tiempo de simulación preciso
            state: simulator.state.slice(),
            // --- MODIFICADO: incluir ángulos del ESP32 en inputs ---
            inputs: [T, tau_x, tau_y, tau_z, safeRoll, safePitch, safeYaw]
        };
        simHistory.push(simData);
        io.emit("datosSimulacion", simData); // Emitir datos simulados en tiempo real
    }, 30); // 30 ms interval for simulation steps

    res.json({ message: 'Simulación iniciada', params: simulationParams });
});

// Endpoint para detener la simulación
app.post('/simulate/stop', (req, res) => {
    if (!simMode) {
        return res.status(400).json({ error: 'No hay simulación activa' });
    }
    simMode = false;
    if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
    }
    res.json({ message: 'Simulación detenida' });
});

// Nueva función buildCombined() para unificar datos de lastAngles, lastControl y lastMotors
function buildCombined() {
    const ANGLES_FIELDS = [
        'AngleRoll', 'AnglePitch', 'AngleYaw',
        'RateRoll', 'RatePitch', 'RateYaw',
        'AccX', 'AccY', 'AccZ'
    ];
    const CONTROL_FIELDS = [
        'tau_x', 'tau_y', 'tau_z',
        'KalmanAngleRoll', 'KalmanAnglePitch',
        'error_phi', 'error_theta',
        'InputThrottle', 'InputRoll', 'InputPitch', 'InputYaw'
    ];
    const MOTORS_FIELDS = [
        'MotorInput1', 'MotorInput2', 'MotorInput3', 'MotorInput4',
        'Altura', 'modo'
    ];
    const combined = {};
    // Map AngleRoll, AnglePitch, AngleYaw from AngleRoll_est, AnglePitch_est, AngleYaw if present
    combined.AngleRoll = Number(lastAngles.AngleRoll_est ?? lastAngles.AngleRoll) || 0;
    combined.AnglePitch = Number(lastAngles.AnglePitch_est ?? lastAngles.AnglePitch) || 0;
    combined.AngleYaw = Number(lastAngles.AngleYaw ?? lastAngles.AngleYaw_est) || 0;
    // También asigna los alias roll, pitch, yaw para el frontend
    combined.roll = combined.AngleRoll;
    combined.pitch = combined.AnglePitch;
    combined.yaw = combined.AngleYaw;
    // Fill the rest of ANGLES_FIELDS except the above
    for (const key of ANGLES_FIELDS) {
        if (["AngleRoll", "AnglePitch", "AngleYaw"].includes(key)) continue;
        combined[key] = Number(lastAngles[key]) || 0;
    }
    for (const key of CONTROL_FIELDS) {
        combined[key] = Number(lastControl[key]) || 0;
    }
    for (const key of MOTORS_FIELDS) {
        combined[key] = Number(lastMotors[key]) || 0;
    }
    // Agrega los ángulos crudos si existen en lastAngles
    combined.RawRoll = Number(lastAngles.RawRoll) || 0;
    combined.RawPitch = Number(lastAngles.RawPitch) || 0;
    combined.RawYaw = Number(lastAngles.RawYaw) || 0;
    combined.time = new Date().toISOString();
    combined.modo = combined.modo ?? 0;
    return combined;
}

const PORT = envs.PORT || 3002;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});