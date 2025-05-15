import { Router } from 'express';

const router = Router();

// GET endpoint to retrieve sensor data
router.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'Sensor API is working',
        timestamp: new Date().toISOString()
    });
});

// GET endpoint for historical sensor data
router.get('/history', (req, res) => {
    // This could be expanded to fetch data from a database
    res.json({
        status: 'success',
        message: 'Historical sensor data endpoint',
        data: []
    });
});

// POST endpoint for receiving sensor data
router.post('/', (req, res) => {
    const sensorData = req.body;
    console.log('📊 Received sensor data:', sensorData);
    res.json({
        status: 'success',
        message: 'Sensor data received',
        receivedData: sensorData
    });
});

export default router;
