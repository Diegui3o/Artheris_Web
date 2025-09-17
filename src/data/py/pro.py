from scipy.stats import chi2
import metrics as M
import numpy as np
import pandas as pd

def welch_psd(y, fs, seglen=2048, overlap=0.5):
    y = np.asarray(y, float)
    if y.size < 4 or fs <= 0: return (np.array([]), np.array([]))
    y = y - np.nanmean(y)
    seglen = min(seglen, len(y))
    step = max(1, int(seglen * (1 - overlap)))
    win = np.hanning(seglen); W = np.sum(win**2)
    acc = None; k = 0
    for s in range(0, len(y) - seglen + 1, step):
        seg = (y[s:s+seglen] - np.nanmean(y[s:s+seglen])) * win
        Y = np.fft.rfft(seg); S = (np.abs(Y)**2) / (fs * W)
        acc = S if acc is None else (acc + S); k += 1
    if k == 0: return (np.array([]), np.array([]))
    P = acc / k; f = np.fft.rfftfreq(seglen, 1.0/fs)
    return f, P

def detect_steps(ref, t, min_amp_deg=2.0, min_separation_s=0.5):
    ref = np.asarray(ref, float); t = np.asarray(t, float)
    d = np.diff(ref, prepend=ref[0])
    cand = np.where(np.abs(d) >= min_amp_deg)[0]
    events = []; last_t = -1e9
    for i in cand:
        if t[i] - last_t < min_separation_s: 
            continue
        events.append({"idx": int(i), "t": float(t[i]), "amp_deg": float(d[i])})
        last_t = t[i]
    return events

def _first_cross_idx(y, val):
    idx = np.where((y[:-1]-val)*(y[1:]-val) <= 0)[0]
    return int(idx[0]+1) if len(idx) else None

def step_metrics(y, t, idx0, amp, settle_pct=0.02):
    y0 = y[idx0-5:idx0].mean() if idx0>=5 else y[idx0]
    yss = y0 + amp
    band = settle_pct * abs(amp)
    lo, hi = yss - band, yss + band

    # rise time (10%→90%)
    y10, y90 = y0 + 0.1*amp, y0 + 0.9*amp
    def first_cross(val):
        idx = np.where((y[:-1] - val)*(y[1:] - val) <= 0)[0]
        return idx[0]+1 if len(idx) else None
    i10, i90 = first_cross(y10), first_cross(y90)
    rise = t[i90]-t[i10] if i10 and i90 else None

    # overshoot
    peak = y[idx0:idx0+int(3*len(t)/10)].max()  # ventana razonable
    overshoot = 100.0 * (peak - yss) / abs(amp)

    # settling time
    i_set = None
    for i in range(idx0, len(y)):
        if np.all((y[i:] >= lo) & (y[i:] <= hi)):
            i_set = i; break
    ts = t[i_set]-t[idx0] if i_set else None
    return {"rise_time_s": rise, "ts_2pct_s": ts, "overshoot_pct": float(overshoot)}

def estimate_latency_ms(ref, est, fs, max_abs_ms=1000.0):
    a = np.asarray(ref, float)
    b = np.asarray(est, float)
    n = min(len(a), len(b))
    if n < 8 or fs <= 0:
        return None

    a = a[:n] - np.nanmean(a[:n])
    b = b[:n] - np.nanmean(b[:n])

    # Guardas: referencia/estimado sin energía útil → no hay latencia confiable
    if np.nanstd(a) < 1e-6 or np.nanstd(b) < 1e-6:
        return None
    corr = np.correlate(b, a, mode='full')
    lags = np.arange(-n + 1, n)

    # Limitar ventana de latencia plausible (p.ej. ±1 s)
    if max_abs_ms is not None and max_abs_ms > 0:
        max_lag = int(np.ceil((max_abs_ms / 1000.0) * fs))
        keep = (lags >= -max_lag) & (lags <= max_lag)
        if not np.any(keep):
            return None
        corr = corr[keep]
        lags = lags[keep]

    i = int(np.argmax(corr))
    lag = int(lags[i])  # lag>0 => est (kal) retrasado vs ref

    # Si el máximo cae en el borde de la ventana -> sospechoso/degenerado
    if i == 0 or i == len(lags) - 1:
        return None

    return 1000.0 * (lag / fs)

def _analyze_channel(df, ref_col, est_col, t, fs, label):
    # referencia
    if ref_col in df.columns:
        ref = df[ref_col].to_numpy()
        has_ref = np.isfinite(ref).any()
    else:
        ref = np.full_like(t, np.nan, float)
        has_ref = False

    # estimado
    if est_col in df.columns:
        est = df[est_col].to_numpy()
    else:
        est = None

    events = []
    steps = []
    lat_ms = None
    frf_obj = {"freq_hz": [], "mag": [], "mag_db": [], "phase_deg": []}

    if has_ref and est is not None and np.nanstd(ref) > 1e-3 and np.nanstd(est) > 1e-3:
        thr = max(0.05, 0.15*np.nanstd(ref))
        events = detect_steps(ref, t, min_amp_deg=thr, min_separation_s=0.25)
        steps = [
            dict(channel=label, **step_metrics(est, t, ev["idx"], ev["amp_deg"]))
            for ev in events
        ]
        # latencia
        lat = estimate_latency_ms(ref, est, fs)
        lat_ms = None if lat is None else float(lat)

        # FRF
        f, mag, ph = frf_ref_to_est(ref, est, fs)
        mag_db = 20.0 * np.log10(np.maximum(mag, 1e-12))
        frf_obj = {
            "freq_hz": f.tolist(),
            "mag": mag.tolist(),
            "mag_db": mag_db.tolist(),
            "phase_deg": ph.tolist(),
        }
    else:
       frf_obj = {"freq_hz": [], "mag": [], "mag_db": [], "phase_deg": [], "note": "ref/est sin variación suficiente"}
    # métricas del canal
    track = {"overshoot_pct": (max([s["overshoot_pct"] for s in steps]) if steps else None)}
    return {
        "events": events,
        "steps": steps,
        "latency_ms": lat_ms,
        "frf": frf_obj,
        "tracking": track,
    }

def frf_ref_to_est(ref, est, fs, seglen=2048, overlap=0.5):
    ref = np.asarray(ref, float); est = np.asarray(est, float)
    ref -= np.nanmean(ref); est -= np.nanmean(est)
    if fs <= 0 or len(ref) < 8: 
        return np.array([]), np.array([]), np.array([])
    seglen = int(min(seglen, len(ref)))
    step = max(1, int(seglen*(1-overlap)))
    win = np.hanning(seglen)
    Syy = 0.0; Sxy = 0.0; Sxx = 0.0; k = 0
    for s in range(0, len(ref)-seglen+1, step):
        x = ref[s:s+seglen]*win; y = est[s:s+seglen]*win
        X = np.fft.rfft(x); Y = np.fft.rfft(y)
        Sxx += X*np.conj(X); Syy += Y*np.conj(Y); Sxy += X*np.conj(Y)
        k += 1
    if k == 0: 
        return np.array([]), np.array([]), np.array([])
    H = Sxy / np.maximum(Sxx, 1e-12)
    Coh = (np.abs(Sxy)**2) / (np.maximum(Sxx,1e-12)*np.maximum(Syy,1e-12))
    f = np.fft.rfftfreq(seglen, 1.0/fs)
    mask = Coh > 0.6
    return f[mask], np.abs(H[mask]), np.angle(H[mask], deg=True)

def ekf_consistency(residual, sigma_est=None, dof=1):
    r = np.asarray(residual, float)
    if sigma_est is None:
        sigma_est = np.nanstd(r)
    z = r / (sigma_est + 1e-9)
    stat = np.nansum(z**2)
    p = 1.0 - chi2.cdf(stat, dof*len(z))
    return float(p)   # cerca de 0 → inconsistente (subestima ruido)

def disturbance_est(angle, torque, fs, J=0.002, lam=30.0):
    # J * theta_dd = tau - d  =>  d = tau - J*theta_dd (filtrado)
    theta = np.deg2rad(np.asarray(angle, float))
    tau = np.asarray(torque, float)
    dt = 1.0/fs
    theta_d = np.gradient(theta, dt)
    theta_dd = np.gradient(theta_d, dt)
    d = tau - J*theta_dd
    # filtro exponencial
    alpha = np.exp(-lam*dt)
    d_f = np.copy(d)
    for i in range(1, len(d_f)):
        d_f[i] = alpha*d_f[i-1] + (1-alpha)*d[i]
    return d_f

def run_pro_analysis(df: pd.DataFrame):
    t = df["time_seconds"].to_numpy()
    fs = 1.0 / np.median(np.diff(t)) if len(t) > 1 else 0.0

    # analiza roll y pitch
    roll = _analyze_channel(df, "ref_roll", "angle_roll_est", t, fs, "roll")
    pitch = _analyze_channel(df, "ref_pitch", "angle_pitch_est", t, fs, "pitch")

    # Helpers para resúmenes
    def _overshoot_max(steps):
        if not steps:
            return None
        vals = [s.get("overshoot_pct") for s in steps if s.get("overshoot_pct") is not None and np.isfinite(s.get("overshoot_pct"))]
        return float(max(vals)) if vals else None

    def _frf_span(frf_obj):
        f = np.asarray(frf_obj.get("freq_hz", []), float)
        if f.size == 0:
            return None
        return {"f_min_hz": float(np.nanmin(f)), "f_max_hz": float(np.nanmax(f)), "n": int(f.size)}

    # Construcción payload PRO
    pro_payload = {
        "events": [{"channel": "roll", **e} for e in roll["events"]] +
                  [{"channel": "pitch", **e} for e in pitch["events"]],
        "step_responses": roll["steps"] + pitch["steps"],

        "latency": {
            "roll_ref_to_est_ms": roll["latency_ms"],
            "pitch_ref_to_est_ms": pitch["latency_ms"],
        },

        "frf": {"ref_to_est": roll["frf"]},
        "frf_pitch": {"ref_to_est": pitch["frf"]},

        # ---------- NUEVO: resúmenes para la UI ----------
        "pro_summaries": {
            "roll": {
                "num_steps": int(len(roll["events"])) if roll["events"] is not None else 0,
                "overshoot_max_pct": _overshoot_max(roll["steps"]),
                "latency_ms": roll["latency_ms"],
                "frf_span": _frf_span(roll["frf"]),
            },
            "pitch": {
                "num_steps": int(len(pitch["events"])) if pitch["events"] is not None else 0,
                "overshoot_max_pct": _overshoot_max(pitch["steps"]),
                "latency_ms": pitch["latency_ms"],
                "frf_span": _frf_span(pitch["frf"]),
            },
            # Útil para tarjetas de resumen global
            "global": {
                "total_steps": int(len(roll["events"]) + len(pitch["events"])),
                "fs_hz": float(fs),
                "duration_s": float(t[-1] - t[0]) if len(t) > 1 else 0.0,
            }
        }
    }

    # Métricas compactas para flight_metrics.json (sin romper tu UI)
    pro_metrics = {
        "tracking": {
            "roll": {"overshoot_pct": _overshoot_max(roll["steps"])},
            "pitch": {"overshoot_pct": _overshoot_max(pitch["steps"])},
        },
        "latency_ms": {
            "roll": roll["latency_ms"],
            "pitch": pitch["latency_ms"],
        },
        # opcional: eco de summaries clave por si quieres usarlos del lado de métricas
        "summary": {
            "fs_hz": float(fs),
            "total_steps": int(len(roll["events"]) + len(pitch["events"]))
        }
    }

    return pro_payload, pro_metrics


try:
    from scipy.stats import chi2
    def chi2_cdf(x, k): return chi2.cdf(x, k)
except Exception:
    # aproximación usando función gamma incompleta: P(k/2, x/2)
    import numpy as np, math
    def _lower_gamma(s, x, terms=100):
        # serie simple estable para x moderado
        acc = 0.0
        for n in range(terms):
            acc += (x**(s+n)) * math.exp(-x) / math.gamma(s+n+1)
        return acc
    def chi2_cdf(x, k):
        if x < 0: return 0.0
        return _lower_gamma(k/2.0, x/2.0)