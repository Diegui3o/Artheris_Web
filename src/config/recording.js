import express from 'express';
import { insertNewFlight, insertSensorData, printLastSensorData } from '../server/questdb.js';
export default function createRecordingRouter({ io, espNamespace, wss, esp32Socket, state }) {
    const router = express.Router();

    let currentFlightId = null;
    let recordingTimeout = null;
    let latestData = null;
    let modo = 'manual';
    let simControl = {};
    let simMode = false;
    let simHistory = [];

    // Middleware to handle errors
    function errorHandler(err, req, res, next) {
        console.error(err.stack);
        res.status(500).send('Algo salió mal!');
    }

    // Start new recording
    router.post('/start-recording', async (req, res) => {
        try {
            if (recordingTimeout) clearTimeout(recordingTimeout);
            const { Kc, Ki, mass, armLength } = req.body || {};
            if (!Kc || typeof Kc !== 'object' || Object.keys(Kc).length < 6) {
                return res.status(400).json({ error: 'Parámetros Kc incompletos o inválidos' });
            }
            if (!Ki || typeof Ki !== 'object' || Object.keys(Ki).length < 3) {
                return res.status(400).json({ error: 'Parámetros Ki incompletos o inválidos' });
            }
            if (typeof mass !== 'number' || isNaN(mass)) {
                return res.status(400).json({ error: 'Parámetro mass inválido' });
            }
            if (typeof armLength !== 'number' || isNaN(armLength)) {
                return res.status(400).json({ error: 'Parámetro armLength inválido' });
            }
            let flightId;
            try {
                flightId = await insertNewFlight(Kc, Ki, mass, armLength);
            } catch (dbErr) {
                console.error('❌ Error al insertar nuevo vuelo en QuestDB:', dbErr);
                return res.status(500).json({ error: 'Error al guardar vuelo en base de datos', details: dbErr.message });
            }
            currentFlightId = flightId;
            // Update the global state
            state.isRecording = true;
            state.flightId = flightId;
            recordingTimeout = setTimeout(() => {
                console.log('⏱️ Grabación detenida por timeout');
                currentFlightId = null;
                state.isRecording = false;
                state.flightId = null;
            }, 20000);
            res.json({
                message: 'Grabación iniciada',
                flightId,
                recordingDuration: '30 segundos'
            });
        } catch (err) {
            console.error('Error en /start-recording:', err);
            res.status(500).json({ error: 'Error interno en /start-recording', details: err.message });
        }
    });

    // Endpoint to stop recording
    router.post('/stop-recording', (req, res) => {
        currentFlightId = null;
        state.isRecording = false;
        state.flightId = null;
        res.json({ message: 'Grabación detenida' });
    });

    router.get('/debug/latest-data', (req, res) => {
        res.json({
            currentFlightId,
            latestData,
            modo
        });
    });
    router.get('/debug/sensor-data/json', async (req, res) => {
        try {
            const result = await printLastSensorData(10, true);
            res.json({ data: result });
        } catch (err) {
            res.status(500).json({ error: 'Error al consultar sensor_data' });
        }
    });

    // Handle telemetry data and save in Questdb if there is an active flight
    if (io) {
        io.on('connection', (socket) => {
            socket.on('telemetria', (data) => {
                latestData = data;
                modo = data.modo ?? modo;
                if (typeof broadcastData === 'function') broadcastData(data);
                handleTelemetry(data);
            });

            socket.on('message', (data) => {
                try {
                    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                    if (parsedData.type === 'telemetria' && parsedData.payload) {
                        const sensorData = parsedData.payload;
                        latestData = sensorData;
                        modo = sensorData.modo ?? modo;
                        if (typeof broadcastData === 'function') broadcastData(sensorData);
                        handleTelemetry(sensorData);
                    }
                } catch (error) {
                    console.error('Error procesando datos en socket principal:', error);
                }
            });
        });
    }

    if (espNamespace) {
        // Handle ESP32 and keep in Questdb if there is an active flight
        espNamespace.on('connection', (socket) => {
            socket.on('message', (data) => {
                try {
                    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                    if (parsedData.type === 'telemetria' && parsedData.payload) {
                        const sensorData = parsedData.payload;
                        latestData = sensorData;
                        modo = sensorData.modo ?? modo;
                        if (typeof broadcastData === 'function') broadcastData(sensorData);
                        handleTelemetry(sensorData);
                    } else if (parsedData.type === 'state') {
                        if (parsedData.payload && parsedData.payload.mode !== undefined) {
                            modo = parsedData.payload.mode;
                            if (io) io.emit('modo', modo);
                        }
                    }
                } catch (error) {
                    console.error('Error procesando datos del ESP32:', error);
                    console.error('Mensaje original:', data);
                }
            });
        });
    }

    router.get('/recording-status', (req, res) => {
        res.json({
            isRecording: !!currentFlightId,
            flightId: currentFlightId,
            lastDataReceived: latestData ? new Date() : null,
            esp32Connected: !!esp32Socket,
            wsConnections: wss ? wss.clients.size : 0
        });
    });

    return router;
}