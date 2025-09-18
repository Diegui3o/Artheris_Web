import sys, json, argparse, csv, logging, math, os
from typing import List, Dict, Any
from datetime import datetime, timezone
import numpy as np, pandas as pd

# =========================
# Config ajustable (umbral)
# =========================
ENTRY_DEG = 9        
SETTLE_BAND_DEG = 2.5
HOLD_S = 0.10             # tiempo que debe mantenerse dentro de la banda
NOISE_CUTOFF_HZ = 8.0     # frecuencia para "ruido" (HF) en análisis FFT

try:
    from scipy.signal import welch as _welch
except Exception:
    _welch = None
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

def trapz_integral(y: np.ndarray, t: np.ndarray) -> float:
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
    e = np.asarray(e, dtype=float)
    t = np.asarray(t, dtype=float)
    m = np.isfinite(e) & np.isfinite(t)
    e = e[m]; t = t[m]
    if len(e) < 2:
        return {"rmse": 0.0, "mae": 0.0, "ise": 0.0, "iae": 0.0,
                "itae": 0.0, "itse": 0.0, "max_abs": 0.0, "duration_s": 0.0}
    dur = float(t[-1]-t[0])
    rmse = float(np.sqrt(np.mean(e*e)))
    mae  = float(np.mean(np.abs(e)))
    ise  = trapz_integral(e*e, t)
    iae  = trapz_integral(np.abs(e), t)
    tr   = t - t[0]
    itae = trapz_integral(tr*np.abs(e), t)
    itse = trapz_integral(tr*(e*e), t)
    maxabs = float(np.max(np.abs(e)))
    return {"rmse": rmse, "mae": mae, "ise": ise, "iae": iae,
            "itae": itae, "itse": itse, "max_abs": maxabs, "duration_s": dur}

# ---------------------------------
# Ruido HF / SNR / retraso Kalman
# ---------------------------------
def fft_power(y: np.ndarray, fs: float):
    y = nan_clean(y - np.mean(y), 0.0)
    if len(y) < 4 or fs <= 0:
        return 0.0, 0.0, 0.0, 0.0
    if _welch is not None and len(y) >= 16:
        nper = min(256, (len(y)//2)*2) if len(y) >= 32 else len(y)
        freqs, power = _welch(y, fs=fs, nperseg=max(8, nper), noverlap=None)
    else:
        n = len(y)
        yf = np.fft.rfft(y)
        freqs = np.fft.rfftfreq(n, d=1.0/fs)
        power = (np.abs(yf)**2) / n
    total = float(np.sum(power))
    cutoff = min(NOISE_CUTOFF_HZ, 0.45*fs)
    hf_mask = freqs >= cutoff
    hf_power = float(np.sum(power[hf_mask]))
    dom_mask = freqs >= max(0.1, 1.0/len(y))
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

    hf_red_db = 10.0 * math.log10((hf_r + 1e-12) / (hf_k + 1e-12)) if hf_k>0 else 0.0
    snr_r = (tot_r - hf_r) / max(hf_r, 1e-12)
    snr_k = (tot_k - hf_k) / max(hf_k, 1e-12)
    snr_imp_db = 10.0 * math.log10((snr_k + 1e-12) / (snr_r + 1e-12)) if snr_r>0 else 0.0
    raw_z = raw - np.mean(raw)
    kal_z = kal - np.mean(kal)
    corr = np.correlate(kal_z, raw_z, mode="full")
    lags = np.arange(-m+1, m)
    # Limita ventana a ±0.5 s para evitar matches espurios
    max_lag = max(1, int(0.5 * fs))
    keep = (lags >= -max_lag) & (lags <= max_lag)
    corr = corr[keep]; lags = lags[keep]
    if len(lags) == 0:
        delay_s = 0.0
    else:
        lag = int(lags[np.argmax(corr)])
        delay_s = float(lag)/float(fs)

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

def time_to_zero_after_excursion(y: np.ndarray, t: np.ndarray,
                                 entry_deg=ENTRY_DEG,
                                 zero_band_deg=1.0,
                                 hold_s=0.04) -> float:
    """
    Tiempo desde la primera excursión |y|>=entry_deg hasta el primer cruce por 0°,
    con pequeña histéresis (zero_band_deg) y una retención corta (hold_s) para evitar jitter.
    Devuelve NaN si no hay excursión o no hay cruce claro.
    """
    y = nan_clean(y, 0.0); t = nan_clean(t, 0.0)
    if len(y) < 3 or len(t) < 3:
        return float("nan")

    fs = estimate_fs(t)
    hold_pts = max(1, int(round(hold_s * fs))) if fs > 0 else 1

    # 1) Buscar primera excursión grande
    idx_entry = None
    for i, v in enumerate(y):
        if abs(v) >= entry_deg:
            idx_entry = i
            break
    if idx_entry is None:
        return float("nan")

    # Signo de la excursión inicial (si es 0, busca el próximo no-cero)
    s = np.sign(y[idx_entry])
    if s == 0.0:
        for k in range(idx_entry + 1, len(y)):
            if y[k] != 0.0:
                s = np.sign(y[k]); break
    if s == 0.0:
        return float("nan")

    # 2) Buscar el primer cruce por 0 (cambio de signo frente a s) después de la entrada
    for k in range(idx_entry, len(y) - 1):
        yk, yk1 = y[k], y[k+1]

        # ¿hay cambio de signo respecto al signo inicial?
        crossed = (yk * s > 0.0) and (yk1 * s <= 0.0)
        entered_zero_band = (abs(yk1) <= zero_band_deg) and (abs(yk) > zero_band_deg) and (yk * s > 0.0)

        if crossed or entered_zero_band:
            # Interpola tiempo exacto de cruce si hay dos signos
            if (yk1 - yk) != 0:
                frac = (0.0 - yk) / (yk1 - yk)
                frac = float(np.clip(frac, 0.0, 1.0))
                t_zero = t[k] + frac * (t[k+1] - t[k])
            else:
                t_zero = t[k+1]

            # 3) Pequeño hold: que se mantenga del otro lado de 0 o dentro de la banda
            end = min(len(y), k + 1 + hold_pts)
            seg = y[k+1:end]
            if len(seg) == 0:
                return float(t_zero - t[idx_entry])

            ok_opposite = np.all(seg * s <= 0.0)   # se queda del otro lado
            ok_in_band  = np.all(np.abs(seg) <= zero_band_deg)  # o se queda pegado a 0

            if ok_opposite or ok_in_band:
                return float(t_zero - t[idx_entry])

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
    tau_std = float(np.std(tau)) if len(tau) else 0.0
    tau_rms = float(np.sqrt(np.mean(tau*tau)))
    tau_energy = trapz_integral(tau*tau, t)
    tau_avg_abs = trapz_integral(np.abs(tau), t) / max(dur, 1e-9)
    dt = np.diff(t); dt[~np.isfinite(dt)] = np.median(dt[np.isfinite(dt)]) if np.any(np.isfinite(dt)) else 1.0
    dt[dt<=0] = np.median(dt[dt>0]) if np.any(dt>0) else 1.0
    if tau_std < 1e-9:
        jerk_rms = 0.0
        tau_constant = True
    else:
        jerk = np.diff(tau) / dt
        jerk_rms = float(np.sqrt(np.mean(jerk*jerk))) if len(jerk) else 0.0
        tau_constant = False
    return {
        "tau_rms": tau_rms,
        "tau_energy": tau_energy,
        "tau_avg_abs": tau_avg_abs,
        "jerk_rms": jerk_rms,
        "tau_constant": tau_constant
    }

# -----------------------------
# Puntaje de estabilización 0-100
# -----------------------------
def stabilization_score(err, settle_s, osc_cycles, effort, duration_s=None, fs=None):
    score = 100.0
    # Error (cap suave)
    score -= min(40.0, 2.0 * max(0.0, err.get("rmse", 0.0)))
    score -= min(20.0, 0.5 * max(0.0, err.get("mae", 0.0)))

    # Asentamiento / oscilaciones
    if math.isfinite(settle_s):
        score -= min(20.0, 0.8 * max(0.0, settle_s))
    score -= min(15.0, 3.0 * max(0, osc_cycles - 1))

    tau_energy = float(effort.get("tau_energy", 0.0))
    tau_rms    = float(effort.get("tau_rms", 0.0))
    jerk_rms   = float(effort.get("jerk_rms", 0.0))
    tau_const  = bool(effort.get("tau_constant", False))

    # Normalizaciones
    if duration_s and duration_s > 0:
        tau_power = tau_energy / duration_s
    else:
        tau_power = tau_energy  # fallback

    if fs and fs > 0 and tau_rms > 0:
        jerk_rms_norm = jerk_rms / (fs * (tau_rms + 1e-9))
    else:
        jerk_rms_norm = 0.0

    if not tau_const:
        score -= min(15.0, 0.01 * tau_power)        # antes 0.0005 * energy
        score -= min(15.0, 5.0  * jerk_rms_norm)    # antes 0.5 * jerk_rms

    return float(max(0.0, min(100.0, score)))

def time_to_zero_nogate(y: np.ndarray, t: np.ndarray,
                        zero_band_deg=1.0, hold_s=0.04) -> float:
    y = nan_clean(y, 0.0); t = nan_clean(t, 0.0)
    if len(y) < 3: return float("nan")
    fs = estimate_fs(t); hold_pts = max(1, int(round(hold_s*fs))) if fs>0 else 1

    # Busca el primer cruce por cero (o entrada a la banda cero) desde el principio
    s0 = np.sign(y[0]) if y[0] != 0 else np.sign(next((v for v in y if v!=0), 0.0))
    for k in range(0, len(y)-1):
        yk, yk1 = y[k], y[k+1]
        crossed = (s0 != 0.0) and (yk*s0 > 0.0) and (yk1*s0 <= 0.0)
        entered = (abs(yk1) <= zero_band_deg) and (abs(yk) > zero_band_deg)
        if crossed or entered:
            frac = 0.0 if (yk1 - yk) == 0 else float(np.clip((0.0 - yk)/(yk1 - yk), 0.0, 1.0))
            t0 = t[k] + frac*(t[k+1]-t[k])
            end = min(len(y), k + 1 + hold_pts)
            seg = y[k+1:end]
            if len(seg)==0 or np.all(seg*s0 <= 0.0) or np.all(np.abs(seg) <= zero_band_deg):
                return float(t0 - t[0])
    return float("nan")

# ------------------
# Cálculo por eje
# ------------------
def axis_metrics(name: str,
                 y_raw: np.ndarray, y_kal: np.ndarray,
                 err: np.ndarray, t: np.ndarray,
                 tau: np.ndarray) -> Dict[str, Any]:
    t = nan_clean(t, 0.0)
    y_raw, y_kal, err, tau = align_minlen(y_raw, y_kal, err, tau)
    min_len = min(len(y_raw), len(y_kal), len(err), len(tau), len(t))
    t = np.asarray(t[:min_len], dtype=float)
    y_raw = y_raw[:min_len]; y_kal = y_kal[:min_len]; err = err[:min_len]; tau = tau[:min_len]

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
    osc = count_oscillations(y_kal, t, crossing_deg=SETTLE_BAND_DEG)
    t_to_zero = time_to_zero_after_excursion(
        y_kal, t,
        entry_deg=ENTRY_DEG,
        zero_band_deg=min(SETTLE_BAND_DEG, 1.0),  # histéresis pequeña alrededor de 0
        hold_s=0.04                                # ~2 muestras a fs≈45–50 Hz
    )

    # Errores (si err no viene, usa y_kal respecto a 0°)
    if not np.any(np.isfinite(err)):
        err = -y_kal.copy()
    em = error_metrics(err, t)
    if np.nanstd(tau) < 1e-6:
        pass
    eff_tau = control_effort(tau, t)
    sc = stabilization_score(em, settle_s if math.isfinite(settle_s) else 0.0, int(osc["cycles"]), eff_tau)
    _, _, fdom, _ = fft_power(y_kal, fs)

    return {
        "name": name,
        "duration_s": dur,
        "fs_hz": fs,
        "signal": { "raw": sig_raw, "kalman": sig_kal, "dominant_freq_hz": fdom },
        "kalman_effectiveness": eff,
        "response": {
            "settling_s": float(settle_s) if math.isfinite(settle_s) else None,
            "time_to_zero_s": float(t_to_zero) if math.isfinite(t_to_zero) else None,
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
    settle_keys = [k for k in roll_axis["response"].keys() if k.startswith("settling_from_")]
    st_key = settle_keys[0] if settle_keys else None
    st_roll = roll_axis["response"].get("settling_s")
    if st_roll is None and st_key:
        st_roll = roll_axis["response"].get(st_key)
    st_pitch = pitch_axis["response"].get("settling_s")
    if st_pitch is None and st_key:
        st_pitch = pitch_axis["response"].get(st_key)

    return {
        "rmse_roll": float(roll_axis["error"]["rmse_deg"]),
        "rmse_pitch": float(pitch_axis["error"]["rmse_deg"]),
        "overshoot_roll_pct": 0.0,
        "overshoot_pitch_pct": 0.0,
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
            "inputs": { ... },
            "metrics": { ... },
            "params": {
                "entry_deg": float(ENTRY_DEG),
                "settle_band_deg": float(SETTLE_BAND_DEG),
                "hold_s": float(HOLD_S),
                "noise_cutoff_hz": float(NOISE_CUTOFF_HZ)
            },
            "mode": "batch"
        }

    parsed.sort(key=lambda x: x[0])
    rows_sorted = [r for _, r in parsed]
    t_abs = np.array([tv for tv, _ in parsed], dtype=float)
    t = t_abs - t_abs[0]

    # ==== 2) Señales usando filas ORDENADAS ====
    roll_raw, _  = series_from_cols(rows_sorted, ["angle_roll", "AngleRoll", "roll"])
    roll_kal, _  = series_from_cols(rows_sorted, ["angle_roll_est", "KalmanAngleRoll"])
    pitch_raw, _ = series_from_cols(rows_sorted, ["angle_pitch", "AnglePitch", "pitch"])
    pitch_kal, _ = series_from_cols(rows_sorted, ["angle_pitch_est", "KalmanAnglePitch"])
    # Referencias (si no existen, estabilidad -> 0)
    ref_roll_vals, _  = series_from_cols(rows_sorted, ["ref_roll", "roll_ref"])
    ref_pitch_vals, _ = series_from_cols(rows_sorted, ["ref_pitch", "pitch_ref"])

    roll_kal_arr  = np.asarray(roll_kal,  dtype=float)
    pitch_kal_arr = np.asarray(pitch_kal, dtype=float)

    # Si no hay columnas de referencia, usa 0 explícito (misma longitud)
    if not any(v is not None for v in ref_roll_vals):
        ref_roll_arr = np.zeros_like(roll_kal_arr)
    else:
        ref_roll_arr = np.asarray([_sf(v) for v in ref_roll_vals], dtype=float)

    if not any(v is not None for v in ref_pitch_vals):
        ref_pitch_arr = np.zeros_like(pitch_kal_arr)
    else:
        ref_pitch_arr = np.asarray([_sf(v) for v in ref_pitch_vals], dtype=float)

    # Error físico canónico: e = ref - estimado
    err_roll  = ref_roll_arr  - roll_kal_arr
    err_pitch = ref_pitch_arr - pitch_kal_arr
    err_phi  = np.asarray([_sf(r.get("error_phi"))  for r in rows_sorted], dtype=float)
    err_theta= np.asarray([_sf(r.get("error_theta"))for r in rows_sorted], dtype=float)

    tau_x = np.asarray([_sf(r.get("tau_x")) for r in rows_sorted], dtype=float)
    tau_y = np.asarray([_sf(r.get("tau_y")) for r in rows_sorted], dtype=float)
    tau_z = np.asarray([_sf(r.get("tau_z")) for r in rows_sorted], dtype=float)
    # Diagnóstico: advierte si τ parece constante (mapea columnas mal / PWM fijo)
    for name, v in (("tau_x", tau_x), ("tau_y", tau_y), ("tau_z", tau_z)):
        if np.isfinite(v).any():
            stdv = float(np.nanstd(v))
            if stdv < 1e-9:
                logger.warning(f"{name} appears constant (std≈0). Check CSV mapping/source.")

    # ==== 3) Métricas por eje (igual que tenías) ====
    roll_axis = axis_metrics("roll",
                             np.asarray(roll_raw, dtype=float),
                             roll_kal_arr,
                             err_roll, t, tau_x)

    pitch_axis = axis_metrics("pitch",
                              np.asarray(pitch_raw, dtype=float),
                              pitch_kal_arr,
                              err_pitch, t, tau_y)

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

# ---------- CLI / API ----------
def do_batch(csv_path: str):
    rows = load_csv(csv_path)
    df_dbg = pd.DataFrame(rows)
    for col in ["ref_roll","ref_pitch","angle_roll_est","angle_pitch_est"]:
        if col in df_dbg.columns:
            v = pd.to_numeric(df_dbg[col], errors="coerce")
            logger.info("%s std=%s min=%s max=%s",
                        col, float(np.nanstd(v)), float(np.nanmin(v)), float(np.nanmax(v)))
    return compute(rows)

def do_live(payload: Dict[str, Any]) -> Dict[str, Any]:
    samples = payload.get("samples") or []
    if not samples:
        return {"ok": True, "metrics": {}, "mode": "live", "warning": "no_samples"}
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

if __name__ == "__main__":
    import argparse, sys, json

    parser = argparse.ArgumentParser(description="Flight metrics CLI")
    parser.add_argument("--verbose", action="store_true", help="Mostrar logs INFO en stderr")  # <— NUEVO
    sub = parser.add_subparsers(dest="command", required=True)

    p_batch = sub.add_parser("batch", help="Calcular métricas desde CSV")
    p_batch.add_argument("--csv", required=True, help="Ruta del CSV")

    sub.add_parser("live", help="Leer JSON por stdin (samples)")

    args = parser.parse_args()

    # <— NUEVO: sube/baja el nivel en tiempo de ejecución
    logging.getLogger().setLevel(logging.INFO if args.verbose else logging.WARNING)

    try:
        if args.command == "batch":
            res = do_batch(args.csv)
        elif args.command == "live":
            payload_raw = sys.stdin.read() or "{}"
            res = do_live(json.loads(payload_raw))
        print(json.dumps(res))
        sys.exit(0)
    except Exception as e:
        logger.exception("metrics.py failed")
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)