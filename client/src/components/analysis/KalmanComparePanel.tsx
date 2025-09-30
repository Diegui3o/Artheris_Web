import { useState } from "react";

/* ===== Types of endpoint /metrics/compare ===== */
type NIS = {
  available: boolean;
  mean?: number;
  coverage?: number;
  chi2_lo?: number;
  chi2_hi?: number;
  samples?: number;
  alpha?: number;
};
type Whiteness = {
  available: boolean;
  method?: string;
  pvalue?: number;
  pass?: boolean;
  pass_rate?: number;
  lags?: number;
  band?: number;
};
type NEES = {
  available: boolean;
  mean?: number;
  coverage?: number;
  chi2_lo?: number;
  chi2_hi?: number;
  samples?: number;
};
type BasicStats = {
  available: boolean;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  rms?: number;
};

type CompareAxis = {
  innovation_stats: BasicStats;
  nis: NIS;
  innovation_whiteness: Whiteness;
  nees: NEES;
};
type CompareAnalysisAxis = {
  raw_stats: BasicStats;
  xhat_stats: BasicStats;
  tau_stats: BasicStats;
  dominant_freq: { available: boolean; peak_hz?: number; power?: number };
};
type CompareResponse = {
  ok: boolean;
  mode: "batch" | "live";
  inputs: {
    num_samples: number;
    columns_present: string[];
    fs_hz_est: number;
    duration_s: number;
  };
  kalman: { roll: CompareAxis; pitch: CompareAxis };
  analysis: {
    roll: CompareAnalysisAxis;
    pitch: CompareAnalysisAxis;
    correlation: Record<string, number | null>;
  };
  metadata?: { flightId: string; csvPath: string; processedAt: string };
};

/* ===== UI Helpers ===== */
function fmt(v?: number | null, digits = 3) {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return Number(v).toFixed(digits);
}

interface MetricProps {
  label: string;
  value: string | number | null | undefined;
  suffix?: string;
  note?: string;
}
function Metric({ label, value, suffix = "", note }: MetricProps) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="bg-gray-900 p-3 rounded">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-2xl font-bold">
        {missing ? "—" : value}
        {!missing && suffix}
      </div>
      {note && <div className="text-xs text-gray-400 mt-1">{note}</div>}
    </div>
  );
}

/* ===== Component Props ===== */
type KalmanComparePanelProps = {
  flightId?: string | null;
  endpoint?: string;
  className?: string;
};

export default function KalmanComparePanel({
  flightId,
  endpoint = "http://localhost:3002/metrics/compare",
  className = "",
}: KalmanComparePanelProps) {
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const disabled = !flightId || loading;
  const wRoll = compare?.kalman?.roll?.innovation_whiteness;
  const rollWhiteOK = wRoll?.available
    ? typeof wRoll.pass === "boolean"
      ? wRoll.pass
      : (wRoll.pass_rate ?? 0) >= 0.95
    : null;
  const wPitch = compare?.kalman?.pitch?.innovation_whiteness;
  const pitchWhiteOK = wPitch?.available
    ? typeof wPitch.pass === "boolean"
      ? wPitch.pass
      : (wPitch.pass_rate ?? 0) >= 0.95
    : null;
  const runCompare = async () => {
    if (!flightId) return;
    setLoading(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightId }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as CompareResponse;
      setCompare(data);
    } catch (e) {
      console.error("[KalmanComparePanel] error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-gray-800 p-4 rounded-lg ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Kalman comparison</h2>
        <button
          onClick={runCompare}
          disabled={disabled}
          className={`px-4 py-2 rounded ${
            disabled ? "bg-gray-600" : "bg-purple-600 hover:bg-purple-700"
          }`}
          title={!flightId ? "Select a flight" : "Run comparison"}
        >
          {loading ? "Comparing... " : "Compare Kalman (NIS/Whiteness)"}
        </button>
      </div>

      {compare && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Roll */}
          <Metric
            label="NIS mean (roll)"
            value={
              compare.kalman?.roll?.nis?.available
                ? fmt(compare.kalman.roll.nis.mean)
                : "—"
            }
          />
          <Metric
            label="NIS coverage (roll)"
            value={
              compare.kalman?.roll?.nis?.available
                ? `${Math.round(
                    100 * (compare.kalman.roll.nis.coverage || 0)
                  )}%`
                : "—"
            }
          />
          <Metric
            label="Whiteness (roll)"
            value={wRoll?.available ? (rollWhiteOK ? "OK" : "NO") : "—"}
            note={
              wRoll?.available && wRoll.pass_rate != null
                ? `${Math.round(100 * wRoll.pass_rate)}% within band`
                : undefined
            }
          />

          {/* Pitch */}
          <Metric
            label="NIS mean (pitch)"
            value={
              compare.kalman?.pitch?.nis?.available
                ? fmt(compare.kalman.pitch.nis.mean)
                : "—"
            }
          />
          <Metric
            label="NIS coverage (pitch)"
            value={
              compare.kalman?.pitch?.nis?.available
                ? `${Math.round(
                    100 * (compare.kalman.pitch.nis.coverage || 0)
                  )}%`
                : "—"
            }
          />
          <Metric
            label="Whiteness (pitch)"
            value={wPitch?.available ? (pitchWhiteOK ? "OK" : "NO") : "—"}
            note={
              wPitch?.available && wPitch.pass_rate != null
                ? `${Math.round(100 * (wPitch.pass_rate || 0))}% within band`
                : undefined
            }
          />

          {/* Peak frequencies x̂ */}
          <Metric
            label="fₚ pico roll (x̂)"
            value={
              compare.analysis?.roll?.dominant_freq?.available
                ? `${fmt(compare.analysis.roll.dominant_freq.peak_hz, 2)} Hz`
                : "—"
            }
          />
          <Metric
            label="fₚ pico pitch (x̂)"
            value={
              compare.analysis?.pitch?.dominant_freq?.available
                ? `${fmt(compare.analysis.pitch.dominant_freq.peak_hz, 2)} Hz`
                : "—"
            }
          />
        </div>
      )}
    </div>
  );
}
