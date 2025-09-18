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

def detect_steps(ref, t, min_amp_deg=None, min_separation_s=0.3, debug=False):
    """
    Detect steps in a reference signal with adaptive thresholding.
    
    Args:
        ref: Reference signal array
        t: Time vector (seconds)
        min_amp_deg: Minimum step amplitude in degrees (if None, auto-calculated)
        min_separation_s: Minimum time between steps (seconds)
        debug: If True, print debug information
        
    Returns:
        List of detected step events with timing and amplitude
    """
    ref = np.asarray(ref, float)
    t = np.asarray(t, float)
    
    if debug:
        print(f"Signal stats - length: {len(ref)}, min: {np.nanmin(ref):.2f}°, max: {np.nanmax(ref):.2f}°")
    
    # Calculate signal statistics for adaptive thresholding
    std_ref = np.nanstd(ref)
    median_diff = np.median(np.abs(np.diff(ref)))
    
    if debug:
        print(f"Signal statistics - std: {std_ref:.4f}°, median diff: {median_diff:.4f}°")
    
    # Auto-calculate minimum amplitude if not provided
    if min_amp_deg is None:
        # Base threshold on signal characteristics - more sensitive settings
        min_amp_deg = max(0.1, 1.5 * median_diff)  # Reduced from 3.0 to 1.5 for better sensitivity
        min_amp_deg = min(min_amp_deg, 5.0)  # Reduced cap from 10° to 5°
        
        if debug:
            print(f"Auto-calculated min_amp_deg: {min_amp_deg:.4f}°")
    
    # Smooth the signal to reduce noise sensitivity
    window_size = max(3, int(0.02 * len(ref)))  # 2% of signal length or 3 samples
    if window_size % 2 == 0:  # Ensure odd window size
        window_size += 1
    
    # Apply median filter to reduce noise
    from scipy.signal import medfilt
    ref_smooth = medfilt(ref, kernel_size=window_size)
    
    # Calculate first derivative with improved edge handling
    d = np.diff(ref_smooth, prepend=ref_smooth[0])
    
    if debug:
        print(f"Using window_size: {window_size}, min_amp_deg: {min_amp_deg:.4f}°")
    
    # Find candidate steps that exceed the threshold
    cand = np.where(np.abs(d) >= min_amp_deg)[0]
    
    if debug:
        print(f"Found {len(cand)} candidate steps before filtering")
    
    # Group nearby candidates and keep the maximum in each group
    events = []
    last_t = -1e9
    
    # Look for steps with sufficient duration (at least 3 samples in a row)
    if len(cand) > 0:
        # Group consecutive candidates
        groups = []
        current_group = [cand[0]]
        
        for i in range(1, len(cand)):
            if cand[i] - cand[i-1] <= 3:  # Allow small gaps
                current_group.append(cand[i])
            else:
                if len(current_group) >= 1:  # Reduced from 3 to 1 for more sensitivity
                    groups.append(current_group)
                current_group = [cand[i]]
        
        if len(current_group) >= 1:  # Reduced from 3 to 1
            groups.append(current_group)
        
        if debug:
            print(f"Grouped into {len(groups)} potential steps")
        
        # For each group, find the maximum derivative point
        for group in groups:
            if not group:
                continue
                
            # Find the point with maximum derivative in this group
            peak_idx = group[np.argmax(np.abs(d[group]))]
            peak_time = t[peak_idx]
            
            # Skip if too close to previous step
            if peak_time - last_t < min_separation_s:
                if debug:
                    print(f"Skipping step at t={peak_time:.2f}s (too close to previous step)")
                continue
            
            # Add the step
            events.append({
                "idx": int(peak_idx),
                "t": float(peak_time),
                "amp_deg": float(d[peak_idx])
            })
            last_t = peak_time
            
            if debug:
                print(f"Detected step at t={peak_time:.2f}s, amplitude={d[peak_idx]:.2f}°")
    
    if debug:
        print(f"Final number of detected steps: {len(events)}")
    
    return events

def _step_amp_from_ref(ref, idx, fs, pre=0.15, post=0.35):
    i0 = max(0, idx-int(pre*fs)); i1 = idx
    j0 = idx; j1 = min(len(ref), idx+int(post*fs))
    a0 = np.nanmean(ref[i0:i1]) if i1>i0 else ref[idx]
    a1 = np.nanmean(ref[j0:j1]) if j1>j0 else ref[idx]
    return float(a1 - a0)

def detect_steps_ref(ref, t, fs, min_separation_s=0.25,
                     thr_auto=True, min_amp_deg=None):
    ref = np.asarray(ref, float)
    # suavizado leve para ruido pero conservando rampas
    from scipy.signal import medfilt
    k = max(3, int(0.02*len(ref)) | 1)
    r = medfilt(ref, kernel_size=k)

    d = np.diff(r, prepend=r[0])
    # umbral adaptativo: sensible a rampas
    if thr_auto or min_amp_deg is None:
        thr = max(0.02, 1.5*np.median(np.abs(d)))
    else:
        thr = float(min_amp_deg)

    cand = np.where(np.abs(d) >= thr)[0]
    # agrupar y elegir el pico de derivada por grupo
    events = []
    last_t = -1e9
    if cand.size:
        grp = [cand[0]]
        for i in cand[1:]:
            if i - grp[-1] <= 3:
                grp.append(i)
            else:
                peak = grp[np.argmax(np.abs(d[grp]))]
                if t[peak] - last_t >= min_separation_s:
                    events.append(peak); last_t = t[peak]
                grp = [i]
        # último grupo
        peak = grp[np.argmax(np.abs(d[grp]))]
        if t[peak] - last_t >= min_separation_s:
            events.append(peak)

    # construir eventos con amplitud REAL (promedios antes/después)
    out = []
    for idx in events:
        amp = _step_amp_from_ref(ref, idx, fs)
        if abs(amp) >= max(0.15, 0.5*thr):     # filtro de amplitud razonable
            out.append({"idx": int(idx), "t": float(t[idx]),
                        "amp_deg": float(amp), "source": "ref"})
    return out

def _first_cross_idx(y, val):
    idx = np.where((y[:-1]-val)*(y[1:]-val) <= 0)[0]
    return int(idx[0]+1) if len(idx) else None

def refine_step_amplitude(ref, idx, fs, pre_s=0.20, post_s=0.60):
    """
    Amplitud robusta del escalón usando medianas antes/después del índice idx.
    Devuelve (y_pre, y_post, amp).
    """
    n_pre  = max(3, int(pre_s  * fs))
    n_post = max(5, int(post_s * fs))

    i0 = max(0, idx - n_pre)
    i1 = min(len(ref), idx + n_post)

    y_pre  = float(np.nanmedian(ref[i0:idx])) if idx - i0 >= 3 else float(ref[idx])
    y_post = float(np.nanmedian(ref[idx:i1])) if i1 - idx >= 3 else float(ref[idx])

    amp = y_post - y_pre
    return y_pre, y_post, amp

def step_metrics(y, t, idx0, amp, settle_pct=0.02, lookahead_s=2.5):
    # Estado inicial y objetivo
    y0  = float(np.nanmean(y[max(0, idx0-5):idx0+1]))  # pre
    yss = y0 + amp
    band = settle_pct * abs(amp) + 1e-9
    lo, hi = yss - band, yss + band

    # define 10% y 90% según el signo
    lo_pct, hi_pct = (0.1, 0.9) if amp >= 0 else (0.9, 0.1)
    ylo, yhi = y0 + lo_pct*amp, y0 + hi_pct*amp

    def first_cross_after(val, start):
        if start < 0: start = 0
        idx = np.where((y[start:-1] - val)*(y[start+1:] - val) <= 0)[0]
        return int(idx[0] + start + 1) if len(idx) else None

    i10 = first_cross_after(ylo, max(0, idx0-1))
    i90 = first_cross_after(yhi, max(0, idx0-1))
    rise = None
    if i10 is not None and i90 is not None and i90 >= i10:
        rise = float(t[i90] - t[i10])
    else:
        # fallback 20–80 si 10–90 falla
        lo2, hi2 = (0.2, 0.8) if amp >= 0 else (0.8, 0.2)
        ylo2, yhi2 = y0 + lo2*amp, y0 + hi2*amp
        j10 = first_cross_after(ylo2, max(0, idx0-1))
        j90 = first_cross_after(yhi2, max(0, idx0-1))
        if j10 is not None and j90 is not None and j90 >= j10:
            rise = float(t[j90] - t[j10])

    # ventana razonable para pico (evita barrer toda la serie)
    fs_est = (len(t)-1)/(t[-1]-t[0]) if t[-1] > t[0] else 0.0
    j_end  = min(len(y), idx0 + (int(lookahead_s*fs_est) if fs_est>0 else int(0.4*len(t))))
    seg = y[idx0:j_end] if j_end > idx0+1 else y[idx0:]

    if amp >= 0:
        peak = float(np.nanmax(seg))
        overshoot = max(0.0, 100.0*(peak - yss)/max(abs(amp),1e-9))
    else:
        trough = float(np.nanmin(seg))
        overshoot = max(0.0, 100.0*(yss - trough)/max(abs(amp),1e-9))

    # settling con retención corta para evitar falsos
    hold_n = max(3, int(0.25*fs_est)) if fs_est > 0 else 5
    i_set = None
    for i in range(idx0, len(y)-hold_n):
        ww = y[i:i+hold_n]
        if np.all((ww >= lo) & (ww <= hi)):
            i_set = i + hold_n
            break
    ts = float(t[i_set] - t[idx0]) if i_set is not None else None

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
    ref = df[ref_col].to_numpy() if ref_col in df.columns else None
    est = df[est_col].to_numpy() if est_col in df.columns else None
    has_ref = ref is not None and np.isfinite(ref).any()
    events, steps, lat_ms = [], [], None
    frf_obj = {"freq_hz": [], "mag": [], "mag_db": [], "phase_deg": [], "coh": []}
    est = df[est_col].to_numpy() if est_col in df.columns else None

    events, steps = [], []
    lat_ms = None
    frf_obj = {"freq_hz": [], "mag": [], "mag_db": [], "phase_deg": [], "coh": []}

    if has_ref and est is not None and np.nanstd(ref) > 1e-3 and np.nanstd(est) > 1e-3:
        # Use a more sensitive threshold and enable debug output
        thr = max(0.02, 0.1 * np.nanstd(ref))  # Reduced from 0.15 to 0.1 for better sensitivity
        print(f"\nAnalyzing {label} channel:")
        print(f"  - Signal range: {np.nanmin(ref):.2f}° to {np.nanmax(ref):.2f}°")
        print(f"  - Standard deviation: {np.nanstd(ref):.4f}°")
        print(f"  - Using threshold: {thr:.4f}°")
        
        events = detect_steps_ref(ref, t, fs, min_separation_s=0.25)
        steps  = [dict(channel=label, **step_metrics(est, t, ev["idx"], ev["amp_deg"])) for ev in events]

        # latencia
        lat = estimate_latency_ms(ref, est, fs)
        lat_ms = None if lat is None else float(lat)

    if not events and np.nanstd(est) > 0.5:  # 0.5° por ejemplo
        de = np.diff(est, prepend=est[0])
        thr_e = max(0.3, 0.25*np.nanstd(est))
        idxs = np.where(np.abs(de) >= thr_e)[0]
        # reusa el agrupado de arriba
        peaks = []
        last = -1e9
        for i in idxs:
            if t[i] - last >= 0.25:
                peaks.append(i); last = t[i]
        # amplitud medida en la salida
        def _amp_from_est(y, idx, fs): return _step_amp_from_ref(y, idx, fs)
        for i in peaks:
            amp = _amp_from_est(est, i, fs)
            if abs(amp) >= 0.5:  # deg
                events.append({"idx": int(i), "t": float(t[i]),
                            "amp_deg": float(amp), "source": "est-fallback"})
        steps = [dict(channel=label, **step_metrics(est, t, ev["idx"], ev["amp_deg"])) for ev in events]

        # FRF (H1 con fallback ETFE)
        f, mag, ph, coh = frf_ref_to_est(ref, est, fs)
        if f.size:
            frf_obj = {
                "freq_hz": f.tolist(),
                "mag": mag.tolist(),
                "mag_db": (20.0*np.log10(np.maximum(mag,1e-12))).tolist(),
                "phase_deg": ph.tolist(),
                "coh": ([] if coh is None else coh.tolist()),
            }
            if coh is None:
                frf_obj["note"] = "FRF por ETFE (baja coherencia/energía)"
        else:
            frf_obj = {
                "freq_hz": [], "mag": [], "mag_db": [], "phase_deg": [], "coh": [],
                "note": "FRF no fiable (coherencia baja / poca excitación)"
            }
    else:
        frf_obj = {
            "freq_hz": [], "mag": [], "mag_db": [], "phase_deg": [], "coh": [],
            "note": "ref/est sin variación suficiente"
        }

    track = {"overshoot_pct": (max([s["overshoot_pct"] for s in steps]) if steps else None)}
    return {"events": events, "steps": steps, "latency_ms": lat_ms, "frf": frf_obj, "tracking": track}

def frf_ref_to_est(ref, est, fs, seglen=256, overlap=0.5,
                   fmin=0.1, fmax=None, coh_min=0.3, min_input_psd_db=-200.0):
    """
    H1 entre ref (u) -> est (y) con fallback ETFE si no hay bins válidos.
    Devuelve (f, |H|, fase_deg_unwrapped, coh). En fallback, coh=None.
    """
    ref = np.asarray(ref, float); est = np.asarray(est, float)
    if fs <= 0 or len(ref) < 16 or len(est) < 16:
        return np.array([]), np.array([]), np.array([]), np.array([])

    n = min(len(ref), len(est))
    u = ref[:n] - np.nanmean(ref[:n])
    y = est[:n] - np.nanmean(est[:n])

    # ---- Welch H1 (igual que ya tienes) ----
    L = int(min(seglen, n))
    step = max(1, int(L*(1.0 - overlap)))
    k = 1 + max(0, (n - L)//step)
    if k < 3 and n >= 48:
        L = max(32, int(n/3))
        step = max(1, int(L*(1.0 - overlap)))
        k = 1 + max(0, (n - L)//step)
    if L < 32 or k <= 0:
        return np.array([]), np.array([]), np.array([]), np.array([])

    win = np.hanning(L); W = np.sum(win**2)
    Suu = 0.0 + 0.0j; Syy = 0.0 + 0.0j; Syu = 0.0 + 0.0j; segs = 0
    for s in range(0, n - L + 1, step):
        uu = (u[s:s+L] - np.nanmean(u[s:s+L])) * win
        yy = (y[s:s+L] - np.nanmean(y[s:s+L])) * win
        U = np.fft.rfft(uu); Y = np.fft.rfft(yy)
        Suu += (U*np.conj(U)) / (fs*W)
        Syy += (Y*np.conj(Y)) / (fs*W)
        Syu += (np.conj(U)*Y) / (fs*W)
        segs += 1
    if segs == 0:
        return np.array([]), np.array([]), np.array([]), np.array([])

    H   = Syu / np.maximum(Suu, 1e-16)
    coh = (np.abs(Syu)**2) / (np.maximum(Suu,1e-16) * np.maximum(Syy,1e-16))
    f   = np.fft.rfftfreq(L, 1.0/fs)

    if fmax is None:
        fmax = min(8.0, fs/4.0)

    Puu    = (Suu / segs).real
    Puu_db = 10.0*np.log10(np.maximum(Puu, 1e-24))
    mask = (f >= fmin) & (f <= fmax) & (coh.real >= coh_min) & (Puu_db > min_input_psd_db)

    if np.any(mask):
        mag   = np.abs(H[mask])
        phase = np.unwrap(np.angle(H[mask])) * 180.0/np.pi
        return f[mask], mag, phase, coh[mask].real

    # ---- Fallback: ETFE (un segmento) + suavizado en frecuencia ----
    U = np.fft.rfft(u * np.hanning(n))
    Y = np.fft.rfft(y * np.hanning(n))
    H_etfe = Y / np.maximum(U, 1e-12)
    f_etfe = np.fft.rfftfreq(n, 1.0/fs)

    keep = (f_etfe >= fmin) & (f_etfe <= fmax)
    if not np.any(keep):
        # elige ~1–2 Hz si existe, o los 10 bins centrales para no devolver vacío
        if f_etfe.size == 0:
            return np.array([]), np.array([]), np.array([]), np.array([])
        idx = slice(max(0, f_etfe.size//2 - 5), min(f_etfe.size, f_etfe.size//2 + 5))
        keep = np.zeros_like(f_etfe, dtype=bool); keep[idx] = True

    Hk = H_etfe[keep]; fk = f_etfe[keep]
    if Hk.size >= 5:
        kern = np.ones(5)/5.0
        mag   = np.convolve(np.abs(Hk), kern, mode="same")
        phase = np.unwrap(np.angle(Hk)) * 180.0/np.pi
        phase = np.convolve(phase, kern, mode="same")
    else:
        mag   = np.abs(Hk)
        phase = np.unwrap(np.angle(Hk)) * 180.0/np.pi

    return fk, mag, phase, None

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