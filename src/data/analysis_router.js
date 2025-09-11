import fs from "fs";
import path from "path";
import express from "express";
import { spawn } from "node:child_process";
import { exportFlightToCSV } from "./export_csv.js";

export default function createAnalysisRouter({
  pool,
  outDir = "analysis_out",
  pythonBin = process.platform === "win32" ? "python" : "python3",
  analyzerPy = "src/data/py/analyze_flight.py",
} = {}) {
  const router = express.Router();
  const absOut = path.resolve(process.cwd(), outDir);
  if (!fs.existsSync(absOut)) fs.mkdirSync(absOut, { recursive: true });
  const outBase = absOut;

  // Check if updated_at column exists and initialize tables
  let hasUpdatedAt = false;

  async function initializeDatabase() {
    try {
      // Create analysis_jobs table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS analysis_jobs (
        id SYMBOL CAPACITY 256,
        flight_id SYMBOL CAPACITY 256,
        status SYMBOL CAPACITY 64,
        error STRING,
        job_dir STRING,
        csv_path STRING,
        out_dir STRING,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        updated_at TIMESTAMP,
        ts TIMESTAMP
      ) timestamp(ts);`);

      // Check if updated_at column exists
      const { rows } = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'analysis_jobs' AND column_name = 'updated_at'"
      );
      hasUpdatedAt = rows.length > 0;
      console.log(
        `[analysis] Database initialized, updated_at present: ${hasUpdatedAt}`
      );
    } catch (e) {
      console.error("[analysis] Database initialization error:", e);
      throw e;
    }
  }

  // Initialize database on startup
  initializeDatabase().catch(console.error);
  // ===== Maps para logging por job =====
  const jobOutDirs = new Map(); // jobId -> outDir
  const jobLogStreams = new Map(); // jobId -> {combined, stdout, stderr}

  function getJobStreams(jobId) {
    const outDir = jobOutDirs.get(jobId);
    if (!outDir) return null;
    let streams = jobLogStreams.get(jobId);
    if (!streams) {
      // Asegura carpeta
      fs.mkdirSync(outDir, { recursive: true });
      streams = {
        combined: fs.createWriteStream(path.join(outDir, "job.log"), {
          flags: "a",
        }),
        stdout: fs.createWriteStream(path.join(outDir, "analysis_stdout.log"), {
          flags: "a",
        }),
        stderr: fs.createWriteStream(path.join(outDir, "analysis_stderr.log"), {
          flags: "a",
        }),
      };
      jobLogStreams.set(jobId, streams);
    }
    return streams;
  }

  // Disponible para runPython.logOutput()
  function appendJobLog(jobId, chunk, source = "stdout") {
    try {
      const streams = getJobStreams(jobId);
      if (!streams) return;
      const ts = new Date().toISOString();
      const line = `${ts} [${source}] ${chunk}`;
      // Log combinado legible por /debug/tail
      streams.combined.write(line);
      // Logs separados que /debug/tail ya intenta leer
      if (source === "stdout") streams.stdout.write(chunk);
      else streams.stderr.write(chunk);
    } catch {
      /* noop */
    }
  }

  // --- helper DDL con logging
  async function safeDDL(sql) {
    try {
      console.log("[analysis][DDL] ", sql.trim().split("\n")[0], "…");
      await pool.query(sql);
    } catch (e) {
      const msg = String(e.message || e);
      if (/exists|duplicate|already/i.test(msg)) {
        console.warn("[analysis][DDL ignored]", msg);
        return;
      }
      console.error("[analysis][DDL error]", msg);
      throw e;
    }
  }

  // --- crear tablas (sin CREATE INDEX)
  async function ensureAnalysisTables() {
    let needsMigration = false;
    try {
      const result = await pool.query(
        `SELECT * FROM table_columns WHERE table_name = 'analysis_jobs' AND column = 'ts'`
      );
      needsMigration = result.rows.length === 0;
    } catch {
      needsMigration = true;
    }

    await safeDDL(`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id          SYMBOL CAPACITY 256,
        flight_id   SYMBOL CAPACITY 256,
        status      SYMBOL CAPACITY 64,
        error       STRING,
        job_dir     STRING,
        csv_path    STRING,
        out_dir     STRING,
        started_at  TIMESTAMP,
        finished_at TIMESTAMP,
        updated_at  TIMESTAMP,
        ts          TIMESTAMP
      ) TIMESTAMP(ts)
      PARTITION BY DAY;
    `);

    await safeDDL(`
      CREATE TABLE IF NOT EXISTS analysis_files (
        job_id     SYMBOL CAPACITY 256,
        name       STRING,
        url        STRING,
        path       STRING,
        size       LONG,
        created_ts TIMESTAMP
      ) TIMESTAMP(created_ts)
      PARTITION BY DAY;
    `);
  }

  async function waitUntilJobVisible(
    jobId,
    { timeoutMs = 2000, stepMs = 100 } = {}
  ) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const j = await getJob(jobId);
      if (j) return j;
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return null;
  }

  async function markStaleRunningJobs(maxAgeMinutes = 5) {
    try {
      const cutoff = new Date(
        Date.now() - maxAgeMinutes * 60_000
      ).toISOString();

      // 1) Selecciona candidatos (sin RETURNING)
      const { rows } = await pool.query(
        `SELECT id FROM analysis_jobs
           WHERE status = 'running'
             AND coalesce(updated_at, started_at, ts) < $1`,
        [cutoff]
      );
      const staleIds = rows.map((r) => r.id).filter(Boolean);
      if (staleIds.length === 0) return 0;

      // 2) UPDATE sin RETURNING
      await pool.query(
        `UPDATE analysis_jobs
           SET status = 'error',
               error = 'stale (no heartbeat / server restart)',
               finished_at = now(),
               updated_at = now()
         WHERE status = 'running'
           AND coalesce(updated_at, started_at, ts) < $1`,
        [cutoff]
      );

      console.log(`⚠️ Marked ${staleIds.length} stale running jobs as error`);
      return staleIds.length;
    } catch (e) {
      console.error("Failed to mark stale running jobs:", e.message || e);
      return 0;
    }
  }

  async function columnExists(table, col) {
    try {
      const { rows } = await pool.query(
        `SELECT "column" FROM table_columns WHERE table_name = $1 AND "column" = $2`,
        [table, col]
      );
      return rows.length > 0;
    } catch (e) {
      // table_columns puede no estar lista en arranques
      return false;
    }
  }
  // --- migración de columnas (sin CREATE INDEX)
  async function migrateAnalysisJobsIfNeeded() {
    let have = new Set();

    // --- define addCol ANTES de cualquier uso
    const addCol = async (ddl) => {
      try {
        await pool.query(ddl);
      } catch (e) {
        if (!/exists|duplicate/i.test(String(e.message || e))) throw e;
      }
    };

    try {
      const { rows } = await pool.query(
        `SELECT "column", type FROM table_columns WHERE table_name = 'analysis_jobs'`
      );
      have = new Set(rows.map((r) => r.column ?? r["column"] ?? r.COLUMN));
    } catch (e) {
      console.warn("[analysis] No pude leer table_columns:", e.message);
    }

    if (!have.has("id"))
      await addCol(
        `ALTER TABLE analysis_jobs ADD COLUMN id SYMBOL CAPACITY 256;`
      );
    if (!have.has("started_at"))
      await addCol(
        `ALTER TABLE analysis_jobs ADD COLUMN started_at TIMESTAMP;`
      );
    if (!have.has("finished_at"))
      await addCol(
        `ALTER TABLE analysis_jobs ADD COLUMN finished_at TIMESTAMP;`
      );
    if (!have.has("error"))
      await addCol(`ALTER TABLE analysis_jobs ADD COLUMN error STRING;`);
    if (!have.has("job_dir"))
      await addCol(`ALTER TABLE analysis_jobs ADD COLUMN job_dir STRING;`);
    if (!have.has("csv_path"))
      await addCol(`ALTER TABLE analysis_jobs ADD COLUMN csv_path STRING;`);
    if (!have.has("out_dir"))
      await addCol(`ALTER TABLE analysis_jobs ADD COLUMN out_dir STRING;`);
    if (!have.has("updated_at"))
      await addCol(
        `ALTER TABLE analysis_jobs ADD COLUMN updated_at TIMESTAMP;`
      );

    // backfill opcional
    const colSet = (name) => have.has(name);
    if (colSet("created_ts"))
      await pool.query(
        `UPDATE analysis_jobs SET started_at = created_ts WHERE started_at IS NULL;`
      );
    if (colSet("updated_ts"))
      await pool.query(
        `UPDATE analysis_jobs SET finished_at = updated_ts WHERE finished_at IS NULL;`
      );

    // marcar jobs colgados
    await markStaleRunningJobs(5);

    // cache de presencia de updated_at
    hasUpdatedAt = await columnExists("analysis_jobs", "updated_at");
    console.log(`[analysis] updated_at present: ${hasUpdatedAt}`);
    const exists = await columnExists("analysis_jobs", "updated_at");
    // Solo sube a true; no lo bajes a false por fallos temporales
    if (exists) hasUpdatedAt = true;
    console.log(`[analysis] updated_at present: ${hasUpdatedAt}`);
  }

  // --- init async (pero la función exportada NO es async)
  let isDbReady = false;
  (async () => {
    try {
      await ensureAnalysisTables();
      await migrateAnalysisJobsIfNeeded();
      isDbReady = true;
    } catch (e) {
      console.error("❌ db_init_failed:", e.message || e);
    }
  })();

  // ====== helpers ======
  const newJobId = (flightId) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 6);
    return `job_${timestamp}_${flightId}_${random}`;
  };

  async function createJob({ flightId, jobDir, csvPath, outDir }) {
    const id = newJobId(flightId);
    const status = "pending";
    await pool.query(
      `
      INSERT INTO analysis_jobs
        (id, flight_id, status, error, job_dir, csv_path, out_dir, started_at, ts)
      VALUES
        ($1,  $2,        $3,    $4,   $5,      $6,       $7,      now(),     now())
    `,
      [id, flightId, status, null, jobDir, csvPath, outDir]
    );

    return {
      id,
      flight_id: flightId,
      status,
      error: null,
      job_dir: jobDir,
      csv_path: csvPath,
      out_dir: outDir,
      started_at: new Date().toISOString(),
      finished_at: null,
    };
  }

  async function updateJobStatus(id, status, error = null) {
    const startTime = Date.now();
    const logPrefix = `[updateJobStatus:${id}]`;

    try {
      console.log(
        `${logPrefix} Updating status to '${status}'${
          error ? " with error" : ""
        }`
      );

      // Validate status
      const validStatuses = [
        "pending",
        "running",
        "completed",
        "error",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const sets = [];
      const params = [];
      let paramIndex = 1;

      // Always update status
      sets.push(`status = $${paramIndex++}`);
      params.push(status);

      // Update updated_at if the column exists
      if (hasUpdatedAt) {
        sets.push("updated_at = now()");
      }

      // Add error message if provided
      if (error !== null && error !== undefined) {
        const errorStr =
          typeof error === "string" ? error : error.message || String(error);
        sets.push(`error = $${paramIndex++}`);
        params.push(errorStr.substring(0, 1000)); // Truncate long errors
      }

      // Set finished_at for terminal states
      if (["completed", "error", "cancelled"].includes(status)) {
        sets.push("finished_at = now()");
      }

      // Add WHERE clause
      const whereClause = `WHERE id = $${paramIndex}`;
      params.push(id);

      // 1) UPDATE sin RETURNING
      await pool.query(
        `UPDATE analysis_jobs SET ${sets.join(", ")} ${whereClause}`,
        params
      );
      // 2) SELECT estado actual
      let { rows } = await pool.query(
        `SELECT id, status, error FROM analysis_jobs WHERE id=$1 LIMIT 1`,
        [id]
      );
      if (!rows.length) {
        // 3) Intento de INSERT sin ON CONFLICT
        try {
          await pool.query(
            `INSERT INTO analysis_jobs (id, flight_id, status, error, started_at, ts)
             VALUES ($1, $2, $3, $4, now(), now())`,
            [
              id,
              id.split("_")[1] || "unknown",
              status,
              error ? String(error).slice(0, 1000) : null,
            ]
          );
        } catch {}
        ({ rows } = await pool.query(
          `SELECT id, status, error FROM analysis_jobs WHERE id=$1 LIMIT 1`,
          [id]
        ));
      }
      return rows[0] || null;
    } catch (err) {
      console.error(`${logPrefix} Critical error updating job status:`, {
        error: err.message,
        stack: err.stack,
        status,
        errorParam: error,
      });
      throw err;
    }
  }

  async function waitForDbReady(timeoutMs = 10000) {
    if (isDbReady) return;
    await Promise.race([
      new Promise((resolve) => {
        const iv = setInterval(() => {
          if (isDbReady) {
            clearInterval(iv);
            resolve();
          }
        }, 100);
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Database initialization timeout")),
          timeoutMs
        )
      ),
    ]);
    if (!isDbReady) throw new Error("Database did not finish initializing");
  }

  async function getJob(id) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM analysis_jobs WHERE id = $1`,
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error getting job:", error);
      return null;
    }
  }

  async function findActiveJob(flightId) {
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const { rows } = await pool.query(
      `SELECT * FROM analysis_jobs
        WHERE flight_id = $1
          AND status IN ('pending','running')
          AND coalesce(updated_at, started_at, ts) >= $2
        ORDER BY coalesce(started_at, ts) DESC
        LIMIT 1`,
      [flightId, cutoff]
    );
    return rows[0] || null;
  }

  async function hasFlightRows(flightId) {
    const { rows } = await pool.query(
      `SELECT 1 FROM sensor_data WHERE flight_id = $1 LIMIT 1`,
      [flightId]
    );
    return rows.length > 0;
  }

  // Track active Python processes by job ID
  const activeProcesses = new Map();
  function heartbeatExpr() {
    return hasUpdatedAt
      ? "coalesce(updated_at, started_at, ts)"
      : "coalesce(started_at, ts)";
  }

  function createJobLogger(outDir, jobId) {
    const masterPath = path.join(outDir, "job.log");
    const master = fs.createWriteStream(masterPath, { flags: "a" });

    const write = (level, msg, extra = {}) => {
      const ts = new Date().toISOString();
      const line = `${ts} [${level}] ${msg} ${
        Object.keys(extra).length ? JSON.stringify(extra) : ""
      }\n`;
      try {
        master.write(line);
      } catch {}
    };

    return {
      info: (m, e) => write("INFO", m, e),
      warn: (m, e) => write("WARN", m, e),
      error: (m, e) => write("ERROR", m, e),
      path: masterPath,
      close: () => master.end(),
    };
  }

  // Maximum time a job can run before being considered failed (10 minutes)
  const MAX_JOB_RUNTIME_MS = 10 * 60 * 1000;

  // How often to check for stale jobs (1 minute)
  const STALE_JOB_CHECK_INTERVAL = 60 * 1000;

  // Set up periodic stale job check
  setInterval(() => {
    markStaleRunningJobs(5).catch(console.error);
  }, STALE_JOB_CHECK_INTERVAL);

  function runPython({
    csvPath,
    outDir,
    debug = false,
    pro = true,
    timeoutMs = 300000, // 5 min
    jobId,
  }) {
    return new Promise((resolve, reject) => {
      // --- args para analyzer
      const args = [analyzerPy, csvPath, `--output-dir=${outDir}`, "--plot"];
      if (pro) args.push("--pro");
      if (debug) args.push("--debug");

      // --- logging helper
      const logOutput = (source, chunk) => {
        try {
          appendJobLog(jobId, String(chunk), source);
        } catch {}
      };

      // --- spawn
      const python = spawn(pythonBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        cwd: process.cwd(),
      });

      // guarda el proceso para /cancel
      if (jobId) activeProcesses.set(jobId, python);

      let stdout = "";
      let stderr = "";

      // --- timeout
      const timer = setTimeout(() => {
        try {
          // matar cross-platform
          if (process.platform === "win32") {
            const { exec } = require("node:child_process");
            exec(`taskkill /F /T /PID ${python.pid}`, () => {});
          } else {
            try {
              python.kill("SIGTERM");
            } catch {}
            setTimeout(() => {
              try {
                python.kill("SIGKILL");
              } catch {}
            }, 2000);
          }
        } catch {}
        const err = new Error(`Job timed out after ${timeoutMs}ms`);
        err.code = "ETIMEDOUT";
        reject(err);
      }, timeoutMs);

      // --- streams
      python.stdout.on("data", (d) => {
        const s = d.toString();
        stdout += s;
        logOutput("stdout", s);
      });

      python.stderr.on("data", (d) => {
        const s = d.toString();
        stderr += s;
        logOutput("stderr", s);
      });

      // --- errores de spawn
      python.on("error", (err) => {
        clearTimeout(timer);
        if (jobId) activeProcesses.delete(jobId);
        reject(new Error(`Failed to start Python process: ${err.message}`));
      });

      // --- cierre normal/anómalo
      python.on("close", (code, signal) => {
        clearTimeout(timer);
        if (jobId) activeProcesses.delete(jobId);

        const outputPath = path.join(outDir, "flight_metrics.json");
        const result = { code, signal, stdout, stderr, outputPath };

        if (code !== 0) {
          const msg = `Python exited with code ${code}${
            signal ? ` (signal ${signal})` : ""
          }`;
          const err = new Error(msg);
          err.code = code;
          err.signal = signal;
          err.stdout = stdout;
          err.stderr = stderr;
          err.outputPath = outputPath;
          return reject(err);
        }

        return resolve(result);
      });
    });
  }

  router.post("/cancel/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const job = await getJob(jobId);
    if (!job)
      return res.status(404).json({ ok: false, error: "job_not_found" });

    // Intenta matar el proceso si está vivo
    const proc = activeProcesses.get(jobId);
    if (proc) {
      try {
        if (process.platform === "win32") {
          const { exec } = await import("node:child_process");
          exec(`taskkill /F /T /PID ${proc.pid}`, () => {});
        } else {
          try {
            process.kill(-proc.pid, "SIGTERM");
          } catch {}
          try {
            process.kill(proc.pid, "SIGKILL");
          } catch {}
        }
        activeProcesses.delete(jobId);
      } catch (e) {
        console.warn(`[${jobId}] kill failed:`, e.message);
      }
    }

    await updateJobStatus(jobId, "error", "Analysis cancelled by user");
    return res.json({ ok: true, jobId, status: "cancelled" });
  });

  router.post("/run", async (req, res) => {
    const requestId = `req_${Date.now()}`;
    const logPrefix = `[${requestId}]`;

    try {
      console.log(`${logPrefix} /run request received`, { body: req.body });

      // --- DB ready
      try {
        await waitForDbReady();
      } catch (e) {
        console.error(`${logPrefix} Database not ready:`, e);
        return res.status(500).json({
          ok: false,
          error: "db_init_failed",
          message: "Database initialization failed",
          details: String(e.message || e),
        });
      }

      // --- validar body
      const { flightId, debug = false, pro = true } = req.body || {};
      if (!flightId) {
        console.warn(`${logPrefix} Missing flightId in request`);
        return res.status(400).json({
          ok: false,
          error: "missing_flight_id",
          message: "Flight ID is required",
        });
      }

      console.log(`${logPrefix} Processing flight ${flightId}`);

      // --- marcar jobs colgados
      await markStaleRunningJobs(5);

      // --- si ya hay job activo reciente, devolverlo sin relanzar
      const existing = await findActiveJob(flightId);
      if (existing) {
        // ¿hay proceso vivo en memoria?
        const proc = activeProcesses.get(existing.id);
        if (!proc) {
          // No hay proceso: es un zombie en DB. Lo marcamos error y seguimos a crear job nuevo.
          console.warn(
            `${logPrefix} Existing job is running but no process is attached. Marking as error.`,
            { jobId: existing.id }
          );
          await updateJobStatus(
            existing.id,
            "error",
            "recovered: missing process after restart"
          );
        } else {
          // Sí hay proceso, devolvemos el existente
          console.log(`${logPrefix} Found existing job`, {
            jobId: existing.id,
            status: existing.status,
          });
          return res.json({
            ok: true,
            jobId: existing.id,
            flightId: existing.flight_id,
            status: existing.status,
            assetsBase: `/analysis/assets/${existing.id}`,
            statusUrl: `/analysis/status/${existing.id}`,
            resultsUrl: `/analysis/results/${existing.id}`,
            message:
              existing.status === "running"
                ? "Analysis in progress"
                : existing.status === "completed"
                ? "Analysis already completed"
                : "Analysis status: " + existing.status,
          });
        }
      }

      // --- preparar carpetas
      const jobDir = path.join(outBase, `${flightId}_${Date.now()}`);
      const jobOutDir = path.join(jobDir, "out");
      const csvPath = path.join(jobDir, `flight_${flightId}.csv`);
      fs.mkdirSync(jobOutDir, { recursive: true });

      // --- crear job en DB
      let job = await createJob({
        flightId,
        jobDir,
        csvPath,
        outDir: jobOutDir,
      });
      if (!job || !job.id)
        throw new Error("Failed to create job: invalid object");

      // --- esperar visibilidad
      const visible = await waitUntilJobVisible(job.id);
      if (visible) job = visible;

      jobOutDirs.set(job.id, jobOutDir);

      (async () => {
        let jobSucceeded = false;
        let hb = null;

        try {
          console.log(`[${job.id}] Starting analysis…`);
          await updateJobStatus(job.id, "running");

          // Heartbeat cada 20 s mientras corre el job
          hb = setInterval(() => {
            updateJobStatus(job.id, "running").catch(() => {});
          }, 20_000);

          console.log(`[${job.id}] Exporting CSV…`);
          const exportedCsvPath = await exportFlightToCSV(flightId, jobDir);
          if (exportedCsvPath && exportedCsvPath !== csvPath) {
            fs.copyFileSync(exportedCsvPath, csvPath);
          }
          try {
            const csvInOut = path.join(jobOutDir, path.basename(csvPath));
            fs.copyFileSync(csvPath, csvInOut);
          } catch {}

          console.log(`[${job.id}] Running Python…`);
          await runPython({
            csvPath,
            outDir: jobOutDir,
            debug,
            pro,
            timeoutMs: 300000,
            jobId: job.id,
          });

          jobSucceeded = true;
          console.log(`[${job.id}] ✅ Analysis completed successfully`);
        } catch (err) {
          const errorDetails = {
            message: `Analysis failed: ${err?.message || err}`,
            stack: err?.stack,
            code: err?.code,
            signal: err?.signal,
            stdout: err?.stdout,
            stderr: err?.stderr,
          };
          console.error(`[${job.id}] ❌ Analysis failed`, errorDetails);
          try {
            fs.writeFileSync(
              path.join(jobOutDir, "analysis_error.json"),
              JSON.stringify(errorDetails, null, 2)
            );
          } catch (writeErr) {
            console.error(`[${job.id}] Failed to write error file:`, writeErr);
          }
        } finally {
          try {
            if (hb) clearInterval(hb);
            await updateJobStatus(job.id, jobSucceeded ? "completed" : "error");
          } catch (updateErr) {
            console.error(
              `[${job.id}] Failed to update job status:`,
              updateErr
            );
          }
          // cerrar streams de log abiertos para este job
          try {
            const streams = jobLogStreams.get(job.id);
            if (streams) {
              streams.combined.end();
              streams.stdout.end();
              streams.stderr.end();
              jobLogStreams.delete(job.id);
            }
          } catch (e) {
            console.error(`[${job.id}] Error closing log streams:`, e);
          }
        }
      })().catch((e) =>
        console.error(`[${job.id}] Unhandled error in analysis task:`, e)
      );

      // --- responder inmediatamente
      return res.json({
        ok: true,
        jobId: job.id,
        flightId: job.flight_id,
        assetsBase: `/analysis/assets/${job.id}`,
        statusUrl: `/analysis/status/${job.id}`,
        resultsUrl: `/analysis/results/${job.id}`,
      });
    } catch (e) {
      console.error("Error in /analysis/run:", e);
      return res.status(500).json({
        ok: false,
        error: "internal_server_error",
        message: e.message || "Unknown error during job creation",
      });
    }
  });

  router.get("/plot-data/:jobId", async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job)
      return res.status(404).json({ ok: false, error: "job_not_found" });

    const p = path.join(job.out_dir, "plot_data.json");
    if (!fs.existsSync(p))
      return res.status(404).json({ ok: false, error: "not_found" });

    res.type("application/json").send(fs.readFileSync(p, "utf8"));
  });

  router.get("/metrics/:jobId", async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job)
      return res.status(404).json({ ok: false, error: "job_not_found" });
    const p = path.join(job.out_dir, "flight_metrics.json");
    if (!fs.existsSync(p))
      return res.status(404).json({ ok: false, error: "not_found" });
    res.type("application/json").send(fs.readFileSync(p, "utf8"));
  });

  router.get("/metrics-pro/:jobId", async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job)
      return res.status(404).json({ ok: false, error: "job_not_found" });
    const p = path.join(job.out_dir, "metrics_pro.json");
    if (!fs.existsSync(p))
      return res.status(404).json({ ok: true, exists: false, metrics: null });
    res.type("application/json").send(fs.readFileSync(p, "utf8"));
  });

  router.get("/debug/tail/:jobId", async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || !job.out_dir)
      return res.status(404).json({ ok: false, error: "job_not_found" });

    const readTail = (p, n = 60) => {
      try {
        const s = fs.readFileSync(p, "utf8");
        const lines = s.split(/\r?\n/);
        return lines.slice(-n);
      } catch (error) {
        console.error(`Error reading file ${p}:`, error);
        return [];
      }
    };

    const base = job.out_dir;
    const tail = {
      jobLog: readTail(path.join(base, "job.log")),
      stdout: readTail(path.join(base, "analysis_stdout.log")),
      stderr: readTail(path.join(base, "analysis_stderr.log")),
      errorTxt: readTail(path.join(base, "analysis_error.txt")),
    };
    res.json({ ok: true, status: job.status, tail });
  });

  router.get("/status/:jobId", async (req, res) => {
    try {
      const jobId = req.params.jobId;
      console.log(`Looking up job status for ID: ${jobId}`);
      const job = await getJob(jobId);
      if (!job) {
        console.log(`Job not found: ${jobId}`);
        return res.status(404).json({
          ok: false,
          error: "job_not_found",
          message: `No job found with ID: ${jobId}`,
        });
      }
      console.log(`Found job:`, {
        id: job.id,
        status: job.status,
        flightId: job.flight_id,
      });
      return res.json({
        ok: true,
        job: {
          id: job.id,
          flightId: job.flight_id,
          status: job.status,
          startedAt: job.started_at,
          finishedAt: job.finished_at || null,
          error: job.error,
        },
      });
    } catch (e) {
      console.error("Error in /analysis/status:", e);
      return res.status(500).json({
        ok: false,
        error: "internal_server_error",
        message: e.message,
      });
    }
  });

  router.get("/results/:jobId", async (req, res) => {
    try {
      const job = await getJob(req.params.jobId);
      if (!job)
        return res.status(404).json({ ok: false, error: "job_not_found" });

      const files = [];
      const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
          const p = path.join(dir, name);
          const st = fs.statSync(p);
          if (st.isDirectory()) walk(p);
          else files.push(p);
        }
      };
      if (job.out_dir && fs.existsSync(job.out_dir)) walk(job.out_dir);

      const base = `/analysis/assets/${job.id}`;
      const assets = files.map((abs) => {
        const rel = abs.replace(job.out_dir, "").replace(/^[\\/]/, "");
        return { name: rel, url: `${base}/${rel.replace(/\\/g, "/")}` };
      });
      return res.json({
        ok: true,
        status: job.status,
        error: job.error || null,
        files: assets,
      });
    } catch (e) {
      console.error("Error in /analysis/results:", e);
      return res.status(500).json({
        ok: false,
        error: "internal_server_error",
        message: e.message,
      });
    }
  });

  router.use("/assets/:jobId", async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId);
      if (!job) return res.status(404).send("job_not_found");
      return express.static(job.out_dir)(req, res, next);
    } catch (e) {
      console.error("Static assets error:", e);
      return res.status(500).send("static_error");
    }
  });

  return router;
}
