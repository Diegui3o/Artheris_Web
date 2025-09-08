# src/data/py/metrics.py
import sys, json, argparse, csv, logging, math, statistics
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

import numpy as np

# =========================
# Config ajustable (umbral)
# =========================
ENTRY_DEG = 24.0          # ángulo mínimo para contar evento de asentamiento
SETTLE_BAND_DEG = 5.0     # banda de asentamiento alrededor de 0°
HOLD_S = 0.30             # tiempo que debe mantenerse dentro de la banda
NOISE_CUTOFF_HZ = 8.0     # frecuencia para "ruido" (HF) en análisis FFT

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger(__name__)

def _parse_ts_any(x):
    """Devuelve segundos unix (float) desde: float/epoch(ms/s) o ISO 8601."""
    if x is None or x == "":
        return None
    # numérico
    try:
        v = float(x)
        # heurística epoch ms
        if v > 1e11:
            v = v / 1000.0
        return v
    except Exception:
        pass
    # ISO 8601
    s = str(x).strip()
    try:
        # Maneja 'Z' (UTC)
        if s.endswith("Z"):
            dt = datetime.fromisoformat(s[:-1]).replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None
        
def _sf(x):
    try:
        if x is None or x == "":
            return None
        return float(x)
    except:
        return None

def load_csv(path: str) -> List[Dict[str, Any]]:
    logger.info(f"Loading CSV file: {path}")
    with open(path, "r", newline="", encoding="utf-8") as f:
        data = list(csv.DictReader(f))
    logger.info(f"Loaded {len(data)} rows; cols={list(data[0].keys()) if data else []}")
    return data

def to_seconds(ts):
    out = []
    base = None
    for v in ts:
        tv = _parse_ts_any(v)
        if tv is None:
            out.append(None); continue
        if base is None:
            base = tv
        out.append(tv - base)
    return out

def first_not_none(seq, default=None):
    for v in seq:
        if v is not None:
            return v
    return default

def trapz(y: np.ndarray, t: np.ndarray) -> float:
    if len(y) < 2 or len(t) < 2:
        return 0.0
    return float(np.trapezoid(y, t))

def estimate_fs(t: np.ndarray) -> float:
    """Estimación robusta de frecuencia de muestreo [Hz]."""
    if t is None or len(t) < 2:
        return 0.0
    dt = np.diff(t)
    dt = dt[np.isfinite(dt) & (dt > 0)]
    if len(dt) == 0:
        return 0.0
    med = float(np.median(dt))
    return 1.0/med if med > 0 else 0.0

def nan_clean(a, fill=0.0) -> np.ndarray:
    a = np.asarray(a, dtype=float)
    a[~np.isfinite(a)] = fill
    return a

def align_minlen(*arrs):
    m = min(len(a) for a in arrs if a is not None)
    return [np.asarray(a[:m], dtype=float) for a in arrs]

# -----------------------
# Series y selección cols
# -----------------------
def series_from_cols(rows, names):
    cols = set(rows[0].keys()) if rows else set()
    for name in names:
        if name in cols:
            vals = [_sf(r.get(name)) for r in rows]
            if any(v is not None for v in vals):
                return vals, name
    return ([_sf(r.get(names[0])) for r in rows] if names else []), names[0] if names else "unknown"

# --------------------------
# Métricas de error clásicas
# --------------------------
def error_metrics(e: np.ndarray, t: np.ndarray) -> Dict[str, float]:
    e = nan_clean(e, 0.0)
    t = nan_clean(t, 0.0)
    dur = float(t[-1]-t[0]) if len(t) else 0.0
    rmse = float(np.sqrt(np.mean(e*e))) if len(e) else 0.0
    mae = float(np.mean(np.abs(e))) if len(e) else 0.0
    ise = trapz(e*e, t) if len(e) else 0.0
    iae = trapz(np.abs(e), t) if len(e) else 0.0
    tr = t - (t[0] if len(t) else 0.0)
    itae = trapz(tr*np.abs(e), t) if len(e) else 0.0
    itse = trapz(tr*(e*e), t) if len(e) else 0.0
    maxabs = float(np.max(np.abs(e))) if len(e) else 0.0
    return {
        "rmse": rmse, "mae": mae, "ise": ise, "iae": iae,
        "itae": itae, "itse": itse, "max_abs": maxabs, "duration_s": dur
    }

# ---------------------------------
# Ruido HF / SNR / retraso Kalman
# ---------------------------------
def fft_power(y: np.ndarray, fs: float):
    y = nan_clean(y - np.mean(y), 0.0)
    if len(y) < 4 or fs <= 0:
        return 0.0, 0.0, 0.0, 0.0
    n = len(y)
    yf = np.fft.rfft(y)
    freqs = np.fft.rfftfreq(n, d=1.0/fs)
    power = (np.abs(yf)**2) / n
    total = float(np.sum(power))
    # potencia HF
    cutoff = min(NOISE_CUTOFF_HZ, 0.45*fs)  # si fs es baja, limita a Nyquist*0.45
    hf_mask = freqs >= cutoff
    hf_power = float(np.sum(power[hf_mask]))
    # pico dominante (excluye DC)
    dom_mask = freqs >= max(0.1, 1.0/len(y))  # evita DC
    if np.any(dom_mask):
        idx = int(np.argmax(power[dom_mask]))
        dom_freq = float(freqs[dom_mask][idx])
        dom_pow = float(power[dom_mask][idx])
    else:
        dom_freq, dom_pow = 0.0, 0.0
    return total, hf_power, dom_freq, dom_pow

def kalman_effectiveness(raw: np.ndarray, kal: np.ndarray, fs: float) -> Dict[str, float]:
    m = min(len(raw), len(kal))
    if m < 4 or fs <= 0:
        return {"variance_ratio": 1.0, "hf_noise_reduction_db": 0.0, "snr_improvement_db": 0.0, "delay_s": 0.0}
    raw = nan_clean(raw[:m], 0.0)
    kal = nan_clean(kal[:m], 0.0)

    var_raw = float(np.var(raw))
    var_kal = float(np.var(kal))
    variance_ratio = (var_raw / max(var_kal, 1e-9)) if var_kal>0 else float("inf")

    tot_r, hf_r, _, _ = fft_power(raw, fs)
    tot_k, hf_k, _, _ = fft_power(kal, fs)

    # reducción de ruido HF (dB)
    hf_red_db = 10.0 * math.log10((hf_r + 1e-12) / (hf_k + 1e-12)) if hf_k>0 else 0.0
    # SNR ~ (pot_total - pot_HF) / pot_HF
    snr_r = (tot_r - hf_r) / max(hf_r, 1e-12)
    snr_k = (tot_k - hf_k) / max(hf_k, 1e-12)
    snr_imp_db = 10.0 * math.log10((snr_k + 1e-12) / (snr_r + 1e-12)) if snr_r>0 else 0.0

    # retardo (kalman respecto a raw) por correlación cruzada
    raw_z = raw - np.mean(raw)
    kal_z = kal - np.mean(kal)
    corr = np.correlate(raw_z, kal_z, mode="full")
    lags = np.arange(-m+1, m)
    lag = int(lags[np.argmax(corr)])  # >0 significa kal adelantado
    delay_s = -lag/fs  # retardo de kal respecto a raw (positivo = kal retrasado)

    return {
        "variance_ratio": float(variance_ratio),
        "hf_noise_reduction_db": float(hf_red_db),
        "snr_improvement_db": float(snr_imp_db),
        "delay_s": float(delay_s)
    }

# -----------------------------------------
# Asentamiento desde gran excursión (24→±5)
# -----------------------------------------
def settling_from_excursion(y: np.ndarray, t: np.ndarray,
                            entry_deg=ENTRY_DEG, band_deg=SETTLE_BAND_DEG,
                            hold_s=HOLD_S) -> float:
    y = nan_clean(y, 0.0); t = nan_clean(t, 0.0)
    if len(y) < 3: return float("nan")
    fs = estimate_fs(t)
    hold_pts = max(1, int(round(hold_s*fs))) if fs>0 else 1

    # 1) primer instante con |y| >= entry_deg
    idx_entry = None
    for i, v in enumerate(y):
        if abs(v) >= entry_deg:
            idx_entry = i
            break
    if idx_entry is None:
        return float("nan")

    # 2) desde ahí, buscar primer índice j con |y| <= band_deg que se mantenga hold_pts
    for j in range(idx_entry, len(y)):
        if abs(y[j]) <= band_deg:
            end = min(len(y), j + hold_pts)
            if np.all(np.abs(y[j:end]) <= band_deg):
                return float(max(0.0, t[j] - t[idx_entry]))
    return float("nan")

# -------------------
# Conteo oscilaciones
# -------------------
def count_oscillations(y: np.ndarray, t: np.ndarray,
                       crossing_deg=SETTLE_BAND_DEG,
                       min_cross_dt=0.05) -> Dict[str, float]:
    """Cuenta semi-osc y osc completas con umbral (|y| debe superar crossing_deg entre cruces)."""
    y = nan_clean(y, 0.0); t = nan_clean(t, 0.0)
    if len(y) < 3: return {"half_cycles": 0, "cycles": 0, "dominant_freq_hz": 0.0}

    # cruces por cero (sign change)
    signs = np.sign(y)
    zc_idx = np.where(np.diff(signs) != 0)[0] + 1
    half = 0
    last_t = -1e9
    for a, b in zip(zc_idx[:-1], zc_idx[1:]):
        if t[b] - last_t < min_cross_dt:  # evita jitter
            continue
        if np.max(np.abs(y[a:b])) >= crossing_deg:
            half += 1
            last_t = t[b]
    cycles = half // 2

    # frecuencia dominante (FFT)
    fs = estimate_fs(t)
    _, _, fdom, _ = fft_power(y, fs)
    return {"half_cycles": int(half), "cycles": int(cycles), "dominant_freq_hz": float(fdom)}

# ------------------------
# Esfuerzo de control tau*
# ------------------------
def control_effort(tau: np.ndarray, t: np.ndarray) -> Dict[str, float]:
    tau = nan_clean(tau, 0.0); t = nan_clean(t, 0.0)
    if len(tau) < 2: return {"tau_rms": 0.0, "tau_energy": 0.0, "tau_avg_abs": 0.0, "jerk_rms": 0.0}
    dur = float(t[-1]-t[0]) if len(t) else 0.0
    tau_rms = float(np.sqrt(np.mean(tau*tau)))
    tau_energy = trapz(tau*tau, t)  # ∫ tau^2 dt
    tau_avg_abs = trapz(np.abs(tau), t) / max(dur, 1e-9)
    # jerk ~ derivada de tau
    dt = np.diff(t); dt[~np.isfinite(dt)] = np.median(dt[np.isfinite(dt)]) if np.any(np.isfinite(dt)) else 1.0
    dt[dt<=0] = np.median(dt[dt>0]) if np.any(dt>0) else 1.0
    jerk = np.diff(tau) / dt
    jerk_rms = float(np.sqrt(np.mean(jerk*jerk))) if len(jerk) else 0.0
    return {"tau_rms": tau_rms, "tau_energy": tau_energy, "tau_avg_abs": tau_avg_abs, "jerk_rms": jerk_rms}

# -----------------------------
# Puntaje de estabilización 0-100
# -----------------------------
def stabilization_score(err: Dict[str,float],
                        settle_s: float,
                        osc_cycles: int,
                        effort: Dict[str,float]) -> float:
    # Heurística simple y estable (ajusta pesos a gusto)
    score = 100.0
    # penaliza error
    score -= 2.0 * max(0.0, err.get("rmse", 0.0))           # por cada deg de RMSE
    score -= 0.5 * max(0.0, err.get("mae", 0.0))
    # penaliza asentamiento y oscilaciones
    if math.isfinite(settle_s):
        score -= 0.8 * max(0.0, settle_s)
    score -= 3.0 * max(0, osc_cycles - 1)
    # penaliza esfuerzo de control
    score -= 0.002 * effort.get("tau_energy", 0.0)          # energía (ajusta escala)
    score -= 0.5 * effort.get("jerk_rms", 0.0)
    return float(max(0.0, min(100.0, score)))

# ------------------
# Cálculo por eje
# ------------------
def axis_metrics(name: str,
                 y_raw: np.ndarray, y_kal: np.ndarray,
                 err: np.ndarray, t: np.ndarray,
                 tau: np.ndarray) -> Dict[str, Any]:
    t = nan_clean(t, 0.0)
    y_raw, y_kal, err, tau = align_minlen(y_raw, y_kal, err, tau)
    fs = estimate_fs(t)
    dur = float(t[-1]-t[0]) if len(t) else 0.0

    # Señal (estadística)
    sig_raw = {
        "std": float(np.std(y_raw)) if len(y_raw) else 0.0,
        "rms": float(np.sqrt(np.mean(y_raw*y_raw))) if len(y_raw) else 0.0,
        "peak_deg": float(np.max(np.abs(y_raw))) if len(y_raw) else 0.0,
    }
    sig_kal = {
        "std": float(np.std(y_kal)) if len(y_kal) else 0.0,
        "rms": float(np.sqrt(np.mean(y_kal*y_kal))) if len(y_kal) else 0.0,
        "peak_deg": float(np.max(np.abs(y_kal))) if len(y_kal) else 0.0,
    }

    # Efectividad Kalman
    eff = kalman_effectiveness(y_raw, y_kal, fs)

    # Asentamiento desde 24° a ±5°
    settle_s = settling_from_excursion(y_kal, t, entry_deg=ENTRY_DEG, band_deg=SETTLE_BAND_DEG, hold_s=HOLD_S)
    # Oscilaciones
    osc = count_oscillations(y_kal, t, crossing_deg=SETTLE_BAND_DEG)

    # Errores (si err no viene, usa y_kal respecto a 0°)
    if not np.any(np.isfinite(err)):
        err = y_kal.copy()
    em = error_metrics(err, t)

    # Esfuerzo de control
    # Mapea eje -> tau correspondiente
    #   roll -> tau_x, pitch -> tau_y (cuando esté disponible individualmente)
    eff_tau = control_effort(tau, t)

    # Puntaje
    sc = stabilization_score(em, settle_s if math.isfinite(settle_s) else 0.0, int(osc["cycles"]), eff_tau)

    # Dominant freq de señal
    _, _, fdom, _ = fft_power(y_kal, fs)

    return {
        "name": name,
        "duration_s": dur,
        "fs_hz": fs,
        "signal": { "raw": sig_raw, "kalman": sig_kal, "dominant_freq_hz": fdom },
        "kalman_effectiveness": eff,
        "response": {
            "settling_from_%dd_to_pm%dd_s" % (int(ENTRY_DEG), int(SETTLE_BAND_DEG)): float(settle_s) if math.isfinite(settle_s) else None,
            "oscillations": osc,
        },
        "error": {
            "rmse_deg": em["rmse"],
            "mae_deg": em["mae"],
            "ise_deg2_s": em["ise"],
            "iae_deg_s": em["iae"],
            "itae_deg_s2": em["itae"],
            "itse_deg2_s2": em["itse"],
            "max_abs_error_deg": em["max_abs"],
        },
        "control": eff_tau,
        "stabilization_score": sc
    }

# -----------------------------------
# Compatibilidad con campos “legacy”
# -----------------------------------
def legacy_roll_pitch_fields(roll_axis: Dict[str,Any], pitch_axis: Dict[str,Any]) -> Dict[str,float]:
    # RMSE roll/pitch
    rmse_roll = roll_axis["error"]["rmse_deg"]
    rmse_pitch = pitch_axis["error"]["rmse_deg"]

    # “overshoot” simple vs valor final (no referencia) -> usa pico relativo a 0
    over_roll = max(0.0, roll_axis["signal"]["kalman"]["peak_deg"] / max(1e-6, abs(roll_axis["signal"]["kalman"]["peak_deg"])) * 0.0)  # no significativo sin ref
    over_pitch = max(0.0, pitch_axis["signal"]["kalman"]["peak_deg"] / max(1e-6, abs(pitch_axis["signal"]["kalman"]["peak_deg"])) * 0.0)

    # usamos asentamiento por excursión como “settling_time”
    settle_key = [k for k in roll_axis["response"].keys() if k.startswith("settling_from_")][0]
    st_roll = roll_axis["response"][settle_key]
    st_pitch = pitch_axis["response"][settle_key]

    return {
        "rmse_roll": float(rmse_roll),
        "rmse_pitch": float(rmse_pitch),
        "overshoot_roll_pct": float(over_roll),   # 0.0 por defecto
        "overshoot_pitch_pct": float(over_pitch), # 0.0 por defecto
        "settling_time_roll_s": float(st_roll or 0.0),
        "settling_time_pitch_s": float(st_pitch or 0.0),
    }

# --------------
# compute() top
# --------------
def compute(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows:
        return {"ok": True, "metrics": {}, "mode": "batch"}

    # ==== 1) Parsear timestamp y ORDENAR por tiempo ascendente ====
    parsed = []
    for r in rows:
        ts_any = r.get("timestamp") or r.get("time")  # admite ISO o numérico
        tv = _parse_ts_any(ts_any)
        if tv is not None:
            parsed.append((tv, r))
    if not parsed:
        # sin timestamps válidos → devuelve mínimos pero explícalo
        return {
            "ok": True,
            "inputs": {
                "num_samples": len(rows),
                "columns_present": sorted({k for rr in rows for k in rr.keys()}),
                "fs_hz_est": 0.0,
                "duration_s": 0.0,
            },
            "metrics": {},
            "mode": "batch",
            "warning": "no_valid_timestamps",
        }

    parsed.sort(key=lambda x: x[0])          # <— ordena por tiempo ASC
    rows_sorted = [r for _, r in parsed]
    t_abs = np.array([tv for tv, _ in parsed], dtype=float)
    t = t_abs - t_abs[0]                     # <— segundos desde el inicio (>=0)

    # ==== 2) Señales usando filas ORDENADAS ====
    roll_raw, _  = series_from_cols(rows_sorted, ["angle_roll", "AngleRoll", "roll"])
    roll_kal, _  = series_from_cols(rows_sorted, ["angle_roll_est", "KalmanAngleRoll"])
    pitch_raw, _ = series_from_cols(rows_sorted, ["angle_pitch", "AnglePitch", "pitch"])
    pitch_kal, _ = series_from_cols(rows_sorted, ["angle_pitch_est", "KalmanAnglePitch"])

    err_phi  = np.asarray([_sf(r.get("error_phi"))  for r in rows_sorted], dtype=float)
    err_theta= np.asarray([_sf(r.get("error_theta"))for r in rows_sorted], dtype=float)

    tau_x = np.asarray([_sf(r.get("tau_x")) for r in rows_sorted], dtype=float)
    tau_y = np.asarray([_sf(r.get("tau_y")) for r in rows_sorted], dtype=float)
    tau_z = np.asarray([_sf(r.get("tau_z")) for r in rows_sorted], dtype=float)

    # ==== 3) Métricas por eje (igual que tenías) ====
    roll_axis = axis_metrics("roll",
                             np.asarray(roll_raw, dtype=float),
                             np.asarray(roll_kal, dtype=float),
                             err_phi, t, tau_x)
    pitch_axis = axis_metrics("pitch",
                              np.asarray(pitch_raw, dtype=float),
                              np.asarray(pitch_kal, dtype=float),
                              err_theta, t, tau_y)

    # combinado y legacy (igual que tenías) ...
    kal_eff_roll  = roll_axis["kalman_effectiveness"]
    kal_eff_pitch = pitch_axis["kalman_effectiveness"]
    combined = {
        "stabilization_score": float((roll_axis["stabilization_score"] + pitch_axis["stabilization_score"]) / 2.0),
        "kalman_effectiveness_avg": {
            "variance_ratio": float((kal_eff_roll["variance_ratio"] + kal_eff_pitch["variance_ratio"]) / 2.0),
            "hf_noise_reduction_db": float((kal_eff_roll["hf_noise_reduction_db"] + kal_eff_pitch["hf_noise_reduction_db"]) / 2.0),
            "snr_improvement_db": float((kal_eff_roll["snr_improvement_db"] + kal_eff_pitch["snr_improvement_db"]) / 2.0),
            "delay_s": float((kal_eff_roll["delay_s"] + kal_eff_pitch["delay_s"]) / 2.0),
        }
    }
    legacy = legacy_roll_pitch_fields(roll_axis, pitch_axis)

    return {
        "ok": True,
        "inputs": {
            "num_samples": len(rows_sorted),
            "columns_present": sorted({k for rr in rows_sorted for k in rr.keys()}),  # unión en TODAS las filas
            "fs_hz_est": estimate_fs(t),
            "duration_s": float(t[-1] - t[0]) if len(t) else 0.0,
        },
        "metrics": {
            **legacy,
            "roll": roll_axis,
            "pitch": pitch_axis,
            "combined": combined
        },
        "mode": "batch"
    }

# ----------
# CLI / API
# ----------
def do_batch(csv_path: str):
    rows = load_csv(csv_path)
    return compute(rows)

def do_live(payload: Dict[str, Any]) -> Dict[str, Any]:
    samples = payload.get("samples") or []
    if not samples:
        return {"ok": True, "metrics": {}, "mode": "live", "warning": "no_samples"}
    # homogeniza campos a “rows”
    rows = []
    for i, s in enumerate(samples):
        rows.append({
            "time": s.get("time", s.get("timestamp", i)),
            "angle_roll": s.get("AngleRoll", s.get("angle_roll")),
            "angle_pitch": s.get("AnglePitch", s.get("angle_pitch")),
            "angle_roll_est": s.get("KalmanAngleRoll", s.get("angle_roll_est")),
            "angle_pitch_est": s.get("KalmanAnglePitch", s.get("angle_pitch_est")),
            "error_phi": s.get("error_phi"),
            "error_theta": s.get("error_theta"),
            "tau_x": s.get("tau_x"),
            "tau_y": s.get("tau_y"),
            "tau_z": s.get("tau_z"),
        })
    out = compute(rows)
    out["mode"] = "live"
    return out

def main():
    parser = argparse.ArgumentParser(description="Flight metrics calculator")
    sub = parser.add_subparsers(dest="command", required=True)
    p_batch = sub.add_parser("batch"); p_batch.add_argument("--csv", required=True)
    sub.add_parser("live")
    args = parser.parse_args()

    if args.command == "batch":
        result = do_batch(args.csv)
    else:
        payload_raw = sys.stdin.read() or "{}"
        result = do_live(json.loads(payload_raw))

    print(json.dumps(result))

if __name__ == "__main__":
    main()
