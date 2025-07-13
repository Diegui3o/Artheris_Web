const { spawn } = require('child_process');
const path = require('path');

const pythonPath = path.join(__dirname, 'pds.py');
const py = spawn('python', [pythonPath]);

py.stdout.on('data', (data) => {
    console.log('Python dice:', data.toString());
});

py.stderr.on('data', (data) => {
    console.error('Error de Python:', data.toString());
});

function enviarDatos(datos) {
    py.stdin.write(JSON.stringify(datos) + '\n');
}

module.exports = {
    enviarDatos
};

const datosParaPython = {
    tau_x: getVal(10),
    tau_y: getVal(11),
    tau_z: getVal(12),
    KalmanAngleRoll: getVal(13),
    KalmanAnglePitch: getVal(14),
};

pds.enviarDatos(datosParaPython);