import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pythonProcess;
let resolvePromise = null;
let rejectPromise = null;

function startPythonProcess() {
    const scriptPath = path.join(__dirname, '..', 'server', 'pdi.py');
    console.log(`🐍 Iniciando script de Python en: ${scriptPath}`);

    // Opción multiplataforma para el comando Python
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

    pythonProcess = spawn(pythonCommand, [scriptPath]);

    pythonProcess.stdout.on('data', (data) => {
        const resultStr = data.toString().trim();
        if (!resolvePromise) return;

        try {
            const parsedResult = JSON.parse(resultStr);
            resolvePromise(parsedResult);
        } catch (e) {
            console.error('Error parsing Python output:', resultStr);
            rejectPromise(new Error(`Invalid JSON from Python: ${resultStr}`));
        } finally {
            resolvePromise = null;
            rejectPromise = null;
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const errorStr = data.toString().trim();
        console.error(`[Python Error]: ${errorStr}`);

        if (rejectPromise) {
            // Intenta extraer el mensaje de error si es JSON
            let errorMsg = errorStr;
            try {
                const errorObj = JSON.parse(errorStr);
                errorMsg = errorObj.error || errorStr;
            } catch (_) { }

            rejectPromise(new Error(errorMsg));
            resolvePromise = null;
            rejectPromise = null;
        }
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
        if (code !== 0 && rejectPromise) {
            rejectPromise(new Error(`Python process exited with code ${code}`));
        }
        pythonProcess = null;
    });

    pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process:', err);
        if (rejectPromise) {
            rejectPromise(err);
        }
    });
}

function processImage(base64Image) {
    return new Promise((resolve, reject) => {
        if (!pythonProcess || pythonProcess.killed) {
            startPythonProcess(); // Auto-reinicio si el proceso no está corriendo
        }

        resolvePromise = resolve;
        rejectPromise = reject;

        // Validación básica del input
        if (!base64Image || typeof base64Image !== 'string') {
            reject(new Error('Invalid base64 image data'));
            return;
        }

        // Limpieza del string base64
        const cleanBase64 = base64Image.split(',')[1] || base64Image;

        if (!pythonProcess.stdin.writable) {
            reject(new Error('Python process stdin is not writable'));
            return;
        }

        pythonProcess.stdin.write(cleanBase64 + '\n', (err) => {
            if (err) {
                console.error('Error writing to Python stdin:', err);
                reject(err);
                resolvePromise = null;
                rejectPromise = null;
            }
        });
    });
}

// Manejo de cierre limpio
process.on('exit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
});

export { startPythonProcess, processImage };