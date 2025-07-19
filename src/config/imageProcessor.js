import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// Helper para obtener la ruta del directorio actual en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pythonProcess;
let resolvePromise = null;
let rejectPromise = null;

/**
 * Inicia el script de Python como un proceso hijo.
 */
function startPythonProcess() {
    // Corregimos la ruta para que apunte a la carpeta 'server'
    const scriptPath = path.join(__dirname, '..', 'server', 'pdi.py');
    console.log(`🐍 Iniciando script de Python en: ${scriptPath}`);

    // Cambiamos 'python3' a 'python' para que funcione en Windows
    pythonProcess = spawn('python', [scriptPath]);

    // Escucha la salida estándar (resultados exitosos)
    pythonProcess.stdout.on('data', (data) => {
        const resultStr = data.toString().trim();
        if (resolvePromise) {
            try {
                const parsedResult = JSON.parse(resultStr);
                resolvePromise(parsedResult); // Resuelve con el objeto parseado
            } catch (e) {
                rejectPromise(new Error(`Error al parsear la respuesta JSON de Python: ${resultStr}`));
            }
            resolvePromise = null;
            rejectPromise = null;
        }
    });

    // Escucha la salida de error
    pythonProcess.stderr.on('data', (data) => {
        const errorStr = data.toString().trim();
        console.error(`[Python STDERR]: ${errorStr}`);
        if (rejectPromise) {
            try {
                const parsedError = JSON.parse(errorStr);
                rejectPromise(new Error(parsedError.error || 'Error desconocido desde Python.'));
            } catch (e) {
                rejectPromise(new Error(errorStr)); // Fallback si el error no es JSON
            }
            resolvePromise = null;
            rejectPromise = null;
        }
    });

    pythonProcess.on('close', (code) => {
        console.log(`El script de Python terminó con código ${code}`);
        pythonProcess = null; // Marcar como terminado
        if (rejectPromise) {
            rejectPromise(new Error('El proceso de Python terminó inesperadamente.'));
        }
    });

    pythonProcess.on('error', (err) => {
        console.error('❌ Error al iniciar el proceso de Python:', err);
    });
}

/**
 * Envía una imagen en base64 al script de Python y devuelve una promesa con el resultado.
 * @param {string} base64Image La imagen codificada en base64.
 * @returns {Promise<object>} Una promesa que resuelve con el objeto de resultados.
 */
function processImage(base64Image) {
    return new Promise((resolve, reject) => {
        if (!pythonProcess || pythonProcess.killed) {
            return reject(new Error('El proceso de Python no está corriendo.'));
        }

        resolvePromise = resolve;
        rejectPromise = reject;

        pythonProcess.stdin.write(base64Image + '\n');
    });
}

export { startPythonProcess, processImage };
