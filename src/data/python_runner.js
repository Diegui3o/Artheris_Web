// src/data/python_runner.js
import { spawn } from "child_process";
import { PYTHON_BIN } from "./config.js";

/**
 * Runs a Python script with the given arguments and input.
 * @param {Object} options - Configuration options
 * @param {string} options.script - Path to the Python script
 * @param {Array<string>} [options.args=[]] - Command line arguments
 * @param {Object} [options.input=null] - Input data to pass to stdin as JSON
 * @param {number} [options.timeoutMs=60000] - Execution timeout in milliseconds
 * @returns {Promise<Object>} - Parsed JSON output from the script
 */
export function runPython({
  script,
  args = [],
  input = null,
  timeoutMs = 60_000,
}) {
  return new Promise((resolve, reject) => {
    console.log(`[PythonRunner] Executing: ${PYTHON_BIN} ${script} ${args.join(' ')}`);
    
    const p = spawn(PYTHON_BIN, [script, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true, // Helps with Windows path resolution
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1', // Ensure Python output is not buffered
      },
    });
    
    let out = "";
    let err = "";
    
    const timer = setTimeout(() => {
      console.error(`[PythonRunner] Timeout after ${timeoutMs}ms`);
      p.kill("SIGKILL");
      reject(new Error(`python_timeout_${timeoutMs}ms`));
    }, timeoutMs);

    p.stdout.on("data", (d) => {
      const data = d.toString();
      console.log(`[Python][stdout] ${data}`);
      out += data;
    });
    
    p.stderr.on("data", (d) => {
      const data = d.toString();
      console.error(`[Python][stderr] ${data}`);
      err += data;
    });

    p.on("error", (error) => {
      console.error(`[PythonRunner] Process error: ${error.message}`);
      clearTimeout(timer);
      reject(new Error(`python_spawn_error: ${error.message}`));
    });

    p.on("close", (code, signal) => {
      clearTimeout(timer);
      console.log(`[PythonRunner] Process exited with code ${code}, signal: ${signal}`);
      
      if (code !== 0) {
        const error = new Error(`python_exit_${code}: ${err || 'No error output'}`);
        error.stdout = out;
        error.stderr = err;
        console.error(`[PythonRunner] Error output: ${JSON.stringify({ code, signal, stderr: err, stdout: out })}`);
        return reject(error);
      }
      
      try {
        if (!out.trim()) {
          throw new Error('No output received from Python script');
        }
        const result = JSON.parse(out);
        console.log('[PythonRunner] Successfully parsed JSON output');
        resolve(result);
      } catch (e) {
        console.error(`[PythonRunner] JSON parse error: ${e.message}`);
        const error = new Error(
          `python_invalid_json: ${e.message}\n---stdout---\n${out}\n---stderr---\n${err}`
        );
        error.stdout = out;
        error.stderr = err;
        reject(error);
      }
    });

    // Send input data if provided
    if (input) {
      const inputStr = JSON.stringify(input);
      console.log(`[PythonRunner] Sending input: ${inputStr.substring(0, 200)}${inputStr.length > 200 ? '...' : ''}`);
      p.stdin.write(inputStr, (error) => {
        if (error) {
          console.error(`[PythonRunner] Error writing to stdin: ${error.message}`);
        }
      });
    }
    p.stdin.end();
  });
}
