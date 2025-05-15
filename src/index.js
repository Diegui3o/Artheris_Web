import express, { json } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { envs } from './config/env.js';
import { Server } from 'socket.io';
import sensorRoutes from './server/server.js';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);

// Configuración de IP fija esperada del ESP32
const ESP32_IP = '192.168.1.200'; // Debe coincidir con la IP fija del ESP32

const wss = new WebSocketServer({ server, path: '/esp32' });

wss.on('connection', (ws, req) => {
    console.log('✅ ESP32 conectado');
    ws.on('message', (message) => {
        //console.log('📩 Mensaje recibido del ESP32:', message.toString());
        try {
            const data = JSON.parse(message.toString());
            if (data.type === "telemetria" && data.payload) {
                // Reenviar a todos los clientes de Socket.IO
                io.emit("datosCompleto", {
                    AngleRoll: data.payload.AngleRoll,
                    AnglePitch: data.payload.AnglePitch,
                    AngleYaw: data.payload.AngleYaw,
                    roll: data.payload.AngleRoll,
                    pitch: data.payload.AnglePitch,
                    yaw: data.payload.AngleYaw,
                    Yaw: data.payload.AngleYaw, // Añadido explícitamente para compatibilidad
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
            }
            // Puedes agregar aquí otros tipos de mensajes si lo necesitas
        } catch (err) {
            console.error("Error procesando mensaje del ESP32:", err);
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
        origin: '*', // Permitir todos los orígenes
        methods: ['GET', 'POST'],
    },
    path: '/socket.io', // Ruta por defecto para clientes web
    transports: ['websocket', 'polling'], // Explícitamente permitir WebSocket
});

// Configurar namespace específico para ESP32
const espNamespace = io.of('/ws');

// Puerto del servidor
const PORT = envs.PORT || 3002;

let modo = 1;
let latestData = {};
let esp32Socket = null; // Para mantener referencia al socket del ESP32

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

// Resto de endpoints y manejo de errores...
app.get('/modo/actual', (req, res) => {
    res.json({ modo });
});

app.get('/accion', (req, res) => {
    switch (modo) {
        case 0: return res.json({ message: 'Modo 0: Activando motores' });
        case 1: return res.json({ message: 'Modo 1: En espera' });
        case 2: return res.json({ message: 'Modo 2: Apagando motores' });
    }
});

app.use((err, req, res, next) => {
    console.error('❌ Error del servidor:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor Express corriendo en http://localhost:${PORT}`);
    console.log(`🛰️ Esperando conexión del ESP32 en IP: ${ESP32_IP}`);
    console.log(`📝 Nota: Verificación de IP temporalmente desactivada para depuración`);
});