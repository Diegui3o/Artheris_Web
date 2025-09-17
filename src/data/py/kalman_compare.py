import sys, json, argparse, csv, logging, math
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

import numpy as np

try:
    # opcional (blancura Ljung-Box, ADF, etc.)
    from statsmodels.stats.diagnostic import acorr_ljungbox
except Exception:
    acorr_ljungbox = None

try:
    # opcional (Welch PSD)
    from scipy.signal import welch
except Exception:
    welch = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("kalman_compare")

# ---------- util tiempo ----------
def _parse_ts_any(x):
    if x is None or x == "":
        return None
    try:
        v = float(x)
        if v > 1e11:
            v = v / 1000.0
        return v
    except Exception:
        pass
    s = str(x).strip()
    try:
        if s.endswith("Z"):
            dt = datetime.fromisoformat(s[:-1]).replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None

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

def estimate_fs(t: np.ndarray) -> float:
    if t is None or len(t) < 2:
        return 0.0
    dt = np.diff(t)
    dt = dt[np.isfinite(dt) & (dt > 0)]
    if len(dt) == 0:
        return 0.0
    med = float(np.median(dt))
    return 1.0 / med if med > 0 else 0.0

def nan_clean(a, fill=0.0) -> np.ndarray:
    a = np.asarray(a, dtype=float)
    a[~np.isfinite(a)] = fill
    return a

# ---------- IO ----------
def load_csv(path: str) -> List[Dict[str, Any]]:
    logger.info(f"Loading CSV file: {path}")
    with open(path, "r", newline="", encoding="utf-8") as f:
        data = list(csv.DictReader(f))
    cols = list(data[0].keys()) if data else []
    logger.info(f"Loaded {len(data)} rows; cols={cols}")
    return data

def series(rows, names):
    cols = set().union(*(r.keys() for r in rows)) if rows else set()
    for n in names:
        if n in cols:
            vals = [safe_float(r.get(n)) for r in rows]
            if any(v is not None for v in vals):
                return vals, n
    # no encontrada → lista None
    return [None]*len(rows), names[0]

def safe_float(x):
    try:
        if x is None or x == "":
            return None
        return float(x)
    except:
        return None

# ---------- Métricas KF ----------
def nis_series(innov: np.ndarray, S_var: np.ndarray, alpha=0.05):
    """
    NIS para medida escalar (por eje). innov y S_var longitud T.
    Devuelve media y % dentro del intervalo [chi2_lo, chi2_hi] (df=1).
    """
    from math import isfinite
    innov = nan_clean(innov, 0.0)
    S_var = nan_clean(S_var, np.nan)
    mask = np.isfinite(S_var) & (S_var > 1e-12)
    if not np.any(mask):
        return {"available": False}

    z = innov[mask]
    s = S_var[mask]
    nis = (z*z) / s
    mean_nis = float(np.mean(nis))

    # Intervalos chi2 para df=1
    try:
        from scipy.stats import chi2
        lo = float(chi2.ppf(alpha/2, df=1))
        hi = float(chi2.ppf(1-alpha/2, df=1))
    except Exception:
        # aproximación df=1
        lo, hi = 0.00098, 5.0239

    coverage = float(np.mean((nis >= lo) & (nis <= hi)))
    return {
        "available": True,
        "mean": mean_nis,
        "coverage": coverage,   # fracción de muestras en [lo, hi]
        "alpha": alpha,
        "chi2_lo": lo,
        "chi2_hi": hi,
        "samples": int(len(nis))
    }

def whiteness(innov: np.ndarray, lags=20, alpha=0.05):
    v = np.asarray(innov, dtype=float)
    v = v[np.isfinite(v)]
    if len(v) < max(30, lags + 5):
        if len(v) >= 20:
            lags = min(lags, max(5, len(v)//3))
        else:
            return {"available": False}

    if acorr_ljungbox is not None:
        try:
            df = acorr_ljungbox(v, lags=[lags], return_df=True)
            pval = float(df["lb_pvalue"].iloc[-1])
            if not math.isfinite(pval):
                raise ValueError("non-finite pvalue")
            return {
                "available": True, "method": "ljung_box",
                "lags": lags, "pvalue": pval, "pass": bool(pval > alpha)
            }
        except Exception:
            # cae a ACF si LB no es usable (var≈0, etc.)
            pass

    # Fallback ACF (siempre finito)
    T = len(v)
    band = 1.96 / math.sqrt(T)
    acfs = []
    for k in range(1, lags + 1):
        x1, x2 = v[:-k] - np.mean(v[:-k]), v[k:] - np.mean(v[k:])
        den = np.std(x1) * np.std(x2)
        acf = float(np.mean(x1 * x2) / den) if den > 0 else 0.0
        acfs.append(acf)
    pass_rate = float(np.mean(np.abs(acfs) < band))
    return {
        "available": True, "method": "acf_fallback",
        "lags": lags, "band": band, "pass_rate": pass_rate,
        "pass": pass_rate >= 0.95
    }


def nees_series(xhat: np.ndarray, xtrue: np.ndarray, P_var: np.ndarray, alpha=0.05):
    xhat = nan_clean(xhat, 0.0)
    xtrue = nan_clean(xtrue, np.nan)
    P_var = nan_clean(P_var, np.nan)
    mask = np.isfinite(xtrue) & np.isfinite(P_var) & (P_var > 0)
    if not np.any(mask):
        return {"available": False}
    e = xhat[mask] - xtrue[mask]
    nees = (e*e) / P_var[mask]
    mean_nees = float(np.mean(nees))
    try:
        from scipy.stats import chi2
        lo = float(chi2.ppf(alpha/2, df=1))
        hi = float(chi2.ppf(1-alpha/2, df=1))
    except Exception:
        lo, hi = 0.00098, 5.0239
    coverage = float(np.mean((nees >= lo) & (nees <= hi)))
    return {"available": True, "mean": mean_nees, "coverage": coverage, "alpha": alpha, "chi2_lo": lo, "chi2_hi": hi, "samples": int(len(nees))}

# ---------- Análisis extra ----------
def basic_stats(vec: np.ndarray):
    v = np.asarray(vec, dtype=float)
    v = v[np.isfinite(v)]
    if len(v) == 0:
        return {"available": False}
    return {
        "available": True,
        "mean": float(np.mean(v)),
        "std": float(np.std(v)),
        "min": float(np.min(v)),
        "max": float(np.max(v)),
        "rms": float(np.sqrt(np.mean(v*v)))
    }

def top_freq(y: np.ndarray, fs: float):
    y = nan_clean(y - np.mean(y), 0.0)
    if len(y) < 8 or fs <= 0:
        return {"available": False}
    if welch is not None:
        nper = min(256, (len(y)//2)*2) if len(y) >= 32 else max(16, (len(y)//2)*2)
        f, Pxx = welch(y, fs=fs, nperseg=nper, noverlap=nper//2)
    else:
        # fallback FFT simple
        Y = np.fft.rfft(y)
        f = np.fft.rfftfreq(len(y), d=1.0/fs)
        Pxx = (np.abs(Y)**2)/len(y)
    if len(f) == 0:
        return {"available": False}
    i = int(np.argmax(Pxx[1:])) + 1 if len(Pxx) > 1 else 0
    return {"available": True, "peak_hz": float(f[i]), "power": float(Pxx[i])}

# ---------- Core ----------
AXES = {
    "roll": {
        "innov": ["innov_roll", "innovation_roll", "residual_roll"],
        "S_var": ["S_roll", "S_roll_var", "S_roll_11"],
        "xhat": ["angle_roll_est", "KalmanAngleRoll"],
        "xtrue": ["roll_true", "angle_roll_true", "AngleRollTrue"],
        "P_var": ["P_roll", "P_roll_var", "P_phi_phi"],
        "raw": ["angle_roll", "AngleRoll", "roll"],
        "tau": ["tau_x"],
    },
    "pitch": {
        "innov": ["innov_pitch", "innovation_pitch", "residual_pitch"],
        "S_var": ["S_pitch", "S_pitch_var", "S_pitch_11"],
        "xhat": ["angle_pitch_est", "KalmanAnglePitch"],
        "xtrue": ["pitch_true", "angle_pitch_true", "AnglePitchTrue"],
        "P_var": ["P_pitch", "P_pitch_var", "P_theta_theta"],
        "raw": ["angle_pitch", "AnglePitch", "pitch"],
        "tau": ["tau_y"],
    },
}

def compute(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows:
        return {"ok": True, "mode": "batch", "kalman": {}, "analysis": {}}

    # tiempo
    ts_raw = [r.get("timestamp") for r in rows]
    if not any(_parse_ts_any(v) is not None for v in ts_raw):
        ts_raw = [r.get("time") for r in rows]
    tsec = to_seconds(ts_raw)
    t = nan_clean([v if v is not None else 0.0 for v in tsec], 0.0)
    fs = estimate_fs(t)
    dur = float(t[-1]-t[0]) if len(t) else 0.0

    cols_present = sorted(set().union(*(r.keys() for r in rows))) if rows else []
    out = {
        "ok": True,
        "mode": "batch",
        "inputs": {
            "num_samples": len(rows),
            "columns_present": cols_present,
            "fs_hz_est": fs,
            "duration_s": dur,
        },
        "kalman": {},   # por eje
        "analysis": {   # extras de análisis
            "roll": {},
            "pitch": {},
            "correlation": {},
        }
    }

    # Por eje: NIS, blancura, NEES (si hay columnas)
    for axis, cfg in AXES.items():
        innov, _ = series(rows, cfg["innov"])
        Svar, _ = series(rows, cfg["S_var"])
        xhat, _ = series(rows, cfg["xhat"])
        xtrue, _ = series(rows, cfg["xtrue"])
        Pvar, _ = series(rows, cfg["P_var"])
        raw, _ = series(rows, cfg["raw"])
        tau, _ = series(rows, cfg["tau"])

        innov = np.asarray([v if v is not None else np.nan for v in innov], dtype=float)
        Svar  = np.asarray([v if v is not None else np.nan for v in Svar ], dtype=float)
        xhat  = np.asarray([v if v is not None else np.nan for v in xhat ], dtype=float)
        xtrue = np.asarray([v if v is not None else np.nan for v in xtrue], dtype=float)
        Pvar  = np.asarray([v if v is not None else np.nan for v in Pvar ], dtype=float)
        raw   = np.asarray([v if v is not None else np.nan for v in raw  ], dtype=float)
        tau   = np.asarray([v if v is not None else np.nan for v in tau  ], dtype=float)

        # Sintetiza si faltan columnas NIS
        innov, Svar, nis_is_synth = _synth_innov_and_S(innov, Svar, raw, xhat, fs)

        # Evita "whiteness OK" con varianza ≈ 0 (sin contenido)
        if np.nanstd(innov) < 1e-9:
            wht = {"available": False}
        else:
            wht = whiteness(innov)

        nis = nis_series(innov, Svar)
        if nis.get("available"):
            nis["synthetic"] = bool(nis_is_synth)
            
        # Normaliza 'pass' si no vino:
        if wht.get("available"):
            if "pass" not in wht:
                if "pass_rate" in wht:     # fallback ACF
                    wht["pass"] = float(wht["pass_rate"]) >= 0.95
                elif "pvalue" in wht:      # Ljung-Box
                    wht["pass"] = float(wht["pvalue"]) > 0.05

        # NEES (solo si hay xtrue & Pvar)
        nees = nees_series(xhat, xtrue, Pvar) if np.any(np.isfinite(xtrue)) and np.any(np.isfinite(Pvar)) else {"available": False}

        out["kalman"][axis] = {
            "innovation_stats": basic_stats(innov),
            "nis": nis,
            "innovation_whiteness": wht,
            "nees": nees
        }

        # extras de análisis
        out["analysis"][axis]["raw_stats"] = basic_stats(raw)
        out["analysis"][axis]["xhat_stats"] = basic_stats(xhat)
        out["analysis"][axis]["tau_stats"] = basic_stats(tau)
        out["analysis"][axis]["dominant_freq"] = top_freq(xhat if np.any(np.isfinite(xhat)) else raw, fs)

    # Correlaciones sencillas roll/pitch entre señales clave (cuando existan)
    def corr(a, b):
        a = np.asarray(a, dtype=float); b = np.asarray(b, dtype=float)
        m = np.isfinite(a) & np.isfinite(b)
        if np.sum(m) < 5: return None
        aa, bb = a[m], b[m]
        sa, sb = np.std(aa), np.std(bb)
        if sa == 0 or sb == 0: return None
        return float(np.corrcoef(aa, bb)[0,1])

    # Leer otra vez señales base
    roll_raw, _  = series(rows, AXES["roll"]["raw"])
    pitch_raw, _ = series(rows, AXES["pitch"]["raw"])
    tau_x, _     = series(rows, AXES["roll"]["tau"])
    tau_y, _     = series(rows, AXES["pitch"]["tau"])

    out["analysis"]["correlation"]["roll_pitch_raw"] = corr(roll_raw, pitch_raw)
    out["analysis"]["correlation"]["taux_roll"] = corr(tau_x, roll_raw)
    out["analysis"]["correlation"]["tauy_pitch"] = corr(tau_y, pitch_raw)

    return out

# ---------- CLI ----------
def do_batch(csv_path: str):
    rows = load_csv(csv_path)
    return compute(rows)

def do_live(payload: Dict[str, Any]) -> Dict[str, Any]:
    samples = payload.get("samples") or []
    if not samples:
        return {"ok": True, "mode": "live", "kalman": {}, "analysis": {}, "warning": "no_samples"}
    # homogeneiza a filas
    rows = []
    for i, s in enumerate(samples):
        rows.append({
            "time": s.get("time", s.get("timestamp", i)),
            "angle_roll": s.get("AngleRoll", s.get("angle_roll")),
            "angle_pitch": s.get("AnglePitch", s.get("angle_pitch")),
            "angle_roll_est": s.get("KalmanAngleRoll", s.get("angle_roll_est")),
            "angle_pitch_est": s.get("KalmanAnglePitch", s.get("angle_pitch_est")),
            "tau_x": s.get("tau_x"), "tau_y": s.get("tau_y"),
            # innov/S opcionales si vinieran en vivo:
            "innov_roll": s.get("innov_roll"), "S_roll": s.get("S_roll"),
            "innov_pitch": s.get("innov_pitch"), "S_pitch": s.get("S_pitch"),
        })
    out = compute(rows)
    out["mode"] = "live"
    return out

def _synth_innov_and_S(innov, Svar, raw, xhat, fs):
    # Si ya hay datos válidos, respeta lo existente
    if np.any(np.isfinite(innov)) and np.any(np.isfinite(Svar)) and np.nanmax(Svar) > 0:
        return innov, Svar, False

    # Innov = medida - estimado si falta innov
    if not np.any(np.isfinite(innov)):
        if np.any(np.isfinite(raw)) and np.any(np.isfinite(xhat)):
            m = np.isfinite(raw) & np.isfinite(xhat)
            tmp = np.full_like(raw, np.nan, dtype=float)
            tmp[m] = raw[m] - xhat[m]
            innov = tmp
        else:
            innov = np.full_like(raw if len(raw) else np.array([]), np.nan, dtype=float)

    # S_var = varianza local de innov en ventana ~0.5 s
    if fs and fs > 0:
        win = max(5, int(round(0.5 * fs)))
    else:
        win = 20
    x = innov.copy()
    S = np.full_like(x, np.nan)
    for i in range(len(x)):
        a = max(0, i - win // 2); b = min(len(x), i + win // 2 + 1)
        seg = x[a:b]; seg = seg[np.isfinite(seg)]
        if len(seg) >= max(5, win // 3):
            S[i] = np.var(seg) + 1e-9  # evita cero
    return innov, S, True

def main():
    p = argparse.ArgumentParser(description="Kalman comparison & data analysis")
    sub = p.add_subparsers(dest="command", required=True)
    pb = sub.add_parser("batch"); pb.add_argument("--csv", required=True)
    sub.add_parser("live")
    args = p.parse_args()
    
    if args.command == "batch":
        result = do_batch(args.csv)
    else:
        payload_raw = sys.stdin.read() or "{}"
        result = do_live(json.loads(payload_raw))

    # ÚNICA salida a stdout:
    print(json.dumps(result, allow_nan=False))

if __name__ == "__main__":
    main()
