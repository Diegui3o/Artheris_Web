import express from "express";
import { exportFlightToCSV, getLatestFlightId } from "./export_csv.js";
import { runPython } from "./python_runner.js";
import { PY_METRICS, PY_COMPARE } from "./config.js";
import fs from "fs";

export default function createDataMetricsRouter({ state } = {}) {
  const router = express.Router();

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
  router.post("/metrics/live", express.json(), liveHandler);

  // ===== BATCH igual que tenías =====
  router.post("/metrics/batch", async (req, res) => {
    try {
      let { flightId, csvPath } = req.body || {};
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
        csvPath = await exportFlightToCSV(flightId);
      }
      if (!fs.existsSync(csvPath)) {
        return res.status(404).json({
          ok: false,
          error: "file_not_found",
          message: `No existe: ${csvPath}`,
        });
      }
      const out = await runPython({
        script: PY_METRICS,
        args: ["batch", "--csv", csvPath],
        timeoutMs: 30000,
      });
      return res.json({
        ok: true,
        ...out,
        metadata: { flightId, csvPath, processedAt: new Date().toISOString() },
      });
    } catch (e) {
      console.error("[Batch Metrics] error:", e);
      return res.status(500).json({
        ok: false,
        error: "internal_server_error",
        message: e.message,
      });
    }
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

  // Add compare route
  router.post("/metrics/compare", async (req, res) => {
    try {
      let { flightId, csvPath } = req.body || {};
      if (!csvPath) {
        if (!flightId) {
          flightId = await getLatestFlightId();
          if (!flightId) {
            return res.status(400).json({ ok: false, error: "no_flight_data" });
          }
        }
        csvPath = await exportFlightToCSV(flightId);
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
      return res.json({
        ok: true,
        ...out,
        metadata: { flightId, csvPath, processedAt: new Date().toISOString() },
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
