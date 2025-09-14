import path from "path";
import fs from "fs";
import express from "express";
import { exportFlightToCSV, getLatestFlightId } from "./export_csv.js";
import { runPython } from "./python_runner.js";
import { PY_METRICS, PY_COMPARE, TMP_DIR } from "./config.js";

// Cleanup old temporary files on startup and periodically
function cleanupOldFiles(maxAgeHours = 24) {
  try {
    if (!fs.existsSync(TMP_DIR)) return;

    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const files = fs.readdirSync(TMP_DIR);

    for (const file of files) {
      if (
        file.endsWith(".csv") ||
        file.endsWith(".png") ||
        file.endsWith(".json")
      ) {
        const filePath = path.join(TMP_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            console.log(`[CLEANUP] Removed old file: ${filePath}`);
          }
        } catch (e) {
          console.error(`[CLEANUP] Error removing ${filePath}:`, e);
        }
      }
    }
  } catch (e) {
    console.error("[CLEANUP] Error during cleanup:", e);
  }
}

// Run cleanup on startup and then every 6 hours
cleanupOldFiles();
setInterval(() => cleanupOldFiles(), 6 * 60 * 60 * 1000);

function findExistingCsvForFlight(flightId) {
  try {
    if (!fs.existsSync(TMP_DIR)) return null;
    const files = fs
      .readdirSync(TMP_DIR)
      .filter((n) => n.startsWith(`flight_${flightId}_`) && n.endsWith(".csv"))
      .map((n) => path.join(TMP_DIR, n));
    if (files.length === 0) return null;
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0];
  } catch {
    return null;
  }
}

function isFresh(filePath, maxAgeMs = 10 * 60 * 1000) {
  // 10 min
  try {
    const st = fs.statSync(filePath);
    return Date.now() - st.mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}
export default function createDataMetricsRouter({ state } = {}) {
  const router = express.Router();
  router.use(express.json());
  const logRequest = (req, _res, next) => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );
    if (Object.keys(req.body || {}).length) {
      console.log("Request body:", JSON.stringify(req.body, null, 2));
    }
    next();
  };
  router.use(logRequest);

  async function liveHandler(req, res) {
    try {
      let samples = Array.isArray(req.body?.samples) ? req.body.samples : null;

      if (!samples) {
        const windowMs = Number(req.query.windowMs) || 3000; // <— configurable
        const decimateK = Math.max(1, Number(req.query.decimate) || 3); // <— configurable

        const now = Date.now();
        const buf = Array.isArray(state?.telemetries) ? state.telemetries : [];

        const recent = buf.filter((s) => {
          const t = typeof s.time === "string" ? Date.parse(s.time) : NaN;
          return Number.isFinite(t) && now - t <= windowMs;
        });

        const decimated = recent.filter((_, i) => i % decimateK === 0);
        samples = decimated.map((s) => ({
          time: s.time,
          error_phi: s.error_phi ?? null,
          angle_roll_est: s.KalmanAngleRoll ?? s.angle_roll_est ?? null,
          angle_roll: s.AngleRoll ?? s.angle_roll ?? s.roll ?? null,
        }));
      }

      const out = await runPython({
        script: PY_METRICS,
        args: ["live"],
        input: { samples },
        timeoutMs: 10_000,
      });

      return res.json(out?.metrics ? { ...out.metrics, mode: out.mode } : out);
    } catch (e) {
      console.error("[/metrics/live] error:", e);
      return res
        .status(500)
        .json({ ok: false, error: "live_failed", message: e.message });
    }
  }

  router.get("/metrics/live", liveHandler);
  router.post("/metrics/live", liveHandler);

  // ===== BATCH igual que tenías =====
  router.post("/metrics/batch", async (req, res) => {
    try {
      let { flightId, csvPath, ephemeral, reuseMs } = req.body || {};
      if (typeof ephemeral === "undefined") {
        const keep = String(req.query.keep || "") === "1";
        ephemeral = !keep;
      }
      const rawReuse = Number(reuseMs ?? req.query.reuseMs ?? 10 * 60 * 1000);
      const maxAgeMs = Number.isFinite(rawReuse)
        ? Math.min(Math.max(rawReuse, 0), 24 * 60 * 60 * 1000)
        : 10 * 60 * 1000;

      if (!csvPath) {
        if (!flightId) {
          flightId = await getLatestFlightId();
          if (!flightId) {
            return res.status(400).json({
              ok: false,
              error: "no_flight_data",
              message: "No hay vuelos.",
            });
          }
        }

        // 1) Intentar reutilizar CSV reciente
        const maybe = findExistingCsvForFlight(flightId);
        if (maybe && isFresh(maybe, maxAgeMs)) {
          csvPath = maybe;
        } else {
          // exportar a TMP_DIR (mismo criterio que batch)
          csvPath = await exportFlightToCSV(flightId, TMP_DIR);
        }
      }

      if (!fs.existsSync(csvPath)) {
        return res.status(404).json({
          ok: false,
          error: "file_not_found",
          message: `No existe: ${csvPath}`,
        });
      }

      let out;
      try {
        out = await runPython({
          script: PY_METRICS,
          args: ["batch", "--csv", csvPath],
          timeoutMs: 30_000,
        });
      } finally {
        if (ephemeral && csvPath) {
          try {
            fs.unlinkSync(csvPath);
            console.log(`[metrics] Deleted ephemeral CSV: ${csvPath}`);
          } catch (e) {
            console.warn(`[metrics] Failed to delete CSV: ${csvPath}`, e);
          }
        }
      }
      res.json({
        ok: true,
        ...out,
        metadata: {
          flightId,
          csvPath,
          deleted: Boolean(ephemeral),
          processedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("[Batch Metrics] error:", e);
      if (/No data found for flight/i.test(e.message || "")) {
        return res.status(404).json({
          ok: false,
          error: "no_data_for_flight",
          message: "Este vuelo no tiene muestras en sensor_data.",
        });
      }
      return res
        .status(500)
        .json({
          ok: false,
          error: "internal_server_error",
          message: e.message,
        });
    }
  });
  router.delete("/metrics/purge", (req, res) => {
    const { flightId } = req.query;
    if (!flightId)
      return res.status(400).json({ ok: false, error: "missing_flight_id" });

    let deleted = 0;
    try {
      if (fs.existsSync(TMP_DIR)) {
        for (const n of fs.readdirSync(TMP_DIR)) {
          if (n.startsWith(`flight_${flightId}_`) && n.endsWith(".csv")) {
            try {
              fs.unlinkSync(path.join(TMP_DIR, n));
              deleted++;
            } catch {}
          }
        }
      }
    } catch {}
    return res.json({ ok: true, deleted });
  });
  // proxies de recording (si los usas)
  router.post("/recording/start", (req, res, next) => {
    req.url = "/start-recording";
    next("route");
  });
  router.post("/recording/stop", (req, res, next) => {
    req.url = "/stop-recording";
    next("route");
  });
  router.get("/recording/status", (req, res, next) => {
    req.url = "/recording-status";
    next("route");
  });

  // Add cleanup endpoint
  router.post("/metrics/cleanup", async (req, res) => {
    try {
      const { maxAgeHours = 24 } = req.body;
      await cleanupOldFiles(maxAgeHours);
      return res.json({ ok: true, message: "Cleanup completed" });
    } catch (e) {
      console.error("[/metrics/cleanup] error:", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Add compare route
  router.post("/metrics/compare", async (req, res) => {
    try {
      let { flightId, csvPath, ephemeral, reuseMs } = req.body || {};
      if (typeof ephemeral === "undefined") {
        ephemeral = String(req.query.ephemeral || "") === "1";
      }
      const rawReuse = Number(reuseMs ?? req.query.reuseMs ?? 10 * 60 * 1000);
      const maxAgeMs = Number.isFinite(rawReuse)
        ? Math.min(Math.max(rawReuse, 0), 24 * 60 * 60 * 1000)
        : 10 * 60 * 1000;

      if (!csvPath) {
        if (!flightId) {
          flightId = await getLatestFlightId();
          if (!flightId) {
            return res.status(400).json({ ok: false, error: "no_flight_data" });
          }
        }
        // Reutilizar si existe uno reciente
        const maybe = findExistingCsvForFlight(flightId);
        if (maybe && isFresh(maybe, maxAgeMs)) {
          csvPath = maybe;
        } else {
          csvPath = await exportFlightToCSV(flightId, TMP_DIR);
        }
      }
      if (!fs.existsSync(csvPath)) {
        return res
          .status(404)
          .json({ ok: false, error: "file_not_found", csvPath });
      }
      const out = await runPython({
        script: PY_COMPARE,
        args: ["batch", "--csv", csvPath],
        timeoutMs: 30_000,
      });
      if (ephemeral) {
        try {
          fs.unlinkSync(csvPath);
        } catch {}
      }
      return res.json({
        ok: true,
        ...out,
        metadata: {
          flightId,
          csvPath,
          deleted: Boolean(ephemeral),
          processedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("[/metrics/compare] error:", e);
      return res
        .status(500)
        .json({ ok: false, error: "compare_failed", message: e.message });
    }
  });

  return router;
}
