import numpy as np
import matplotlib.pyplot as plt
import os

def _ensure_1d(a):
    import numpy as _np
    return _np.asarray(a).reshape(-1)

def _savefig(path, fig):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches='tight')
    plt.close(fig)

def plot_ref_meas_error(t, ref, meas, title, outpath):
    t, ref, meas = map(_ensure_1d, (t, ref, meas))
    e = ref - meas
    fig, ax = plt.subplots()
    ax.plot(t, ref, label="ref")
    ax.plot(t, meas, label="est")
    ax.plot(t, e, label="error")
    ax.set_xlabel("Time [s]"); ax.set_title(title); ax.legend()
    _savefig(outpath, fig)

def _welch(x, fs, nperseg=256, noverlap=128):
    x = _ensure_1d(x) - np.mean(x)
    n = len(x)
    if n < 8 or fs <= 0: return np.array([]), np.array([])
    nperseg = min(nperseg, n)
    noverlap = min(noverlap, nperseg-1)
    step = nperseg - noverlap
    if step <= 0: return np.array([]), np.array([])
    w = np.hanning(nperseg)
    U = (w**2).sum()
    segs = []
    for i in range(0, n - nperseg + 1, step):
        seg = x[i:i+nperseg]*w
        X = np.fft.rfft(seg)
        P = (np.abs(X)**2)/(fs*U)
        segs.append(P)
    if not segs: return np.array([]), np.array([])
    f = np.fft.rfftfreq(nperseg, 1/fs)
    Pm = np.mean(np.vstack(segs), axis=0)
    return f, Pm

def plot_psd_raw_vs_kalman(raw, kal, fs, title, outpath):
    f1, P1 = _welch(raw, fs)
    f2, P2 = _welch(kal, fs)
    fig, ax = plt.subplots()
    if f1.size: ax.semilogy(f1, P1, label="raw")
    if f2.size: ax.semilogy(f2, P2, label="kalman")
    ax.set_xlabel("Frequency [Hz]"); ax.set_ylabel("PSD")
    ax.set_title(title); ax.legend()
    _savefig(outpath, fig)

def plot_tracking_axis(t, xhat, u_input=None, ref_value=0.0,
                       axis_name="roll", outdir=".", fname_prefix="roll"):

    t = _ensure_1d(t); xhat = _ensure_1d(xhat)
    ref = np.full_like(xhat, float(ref_value))

    # === figura 1: tracking + input en eje secundario
    fig, ax1 = plt.subplots()
    ax1.plot(t, xhat, label=f"x̂ {axis_name}")
    ax1.plot(t, ref, label="ref", linestyle="--")
    ax1.set_xlabel("Time [s]"); ax1.set_ylabel(f"{axis_name} [deg]")
    title = f"{axis_name.capitalize()} – Tracking (x̂ vs ref)"
    if u_input is not None:
        u = _ensure_1d(u_input).astype(float)
        # Normaliza input para que quepa en la gráfica (p.ej. 1000-2000 → -1..1)
        u_norm = (u - np.nanmedian(u)) / (np.nanpercentile(np.abs(u - np.nanmedian(u)), 95) + 1e-9)
        ax2 = ax1.twinx()
        ax2.plot(t, u_norm, alpha=0.5, label="input (norm)", linestyle=":")
        ax2.set_ylabel("input (norm)")
        lines, labels = [], []
        for ax in (ax1, ax2):
            h, l = ax.get_legend_handles_labels(); lines += h; labels += l
        ax1.legend(lines, labels, loc="best")
        title += " + input"
    else:
        ax1.legend(loc="best")

    ax1.set_title(title)
    _savefig(os.path.join(outdir, f"{fname_prefix}_tracking.png"), fig)

    # === figura 2: error + histograma
    e = ref - xhat
    fig, (ax, axh) = plt.subplots(2, 1, height_ratios=[3,1], figsize=(8,6))
    ax.plot(t, e, label="error = ref - x̂")
    ax.axhline(0, color="k", linewidth=0.5)
    ax.set_xlabel("Time [s]"); ax.set_ylabel("error [deg]")
    ax.set_title(f"{axis_name.capitalize()} – Error temporal")
    ax.legend()
    # hist rápido (PDF + CDF)
    x = e[np.isfinite(e)]
    if len(x):
        axh.hist(x, bins=40, density=True, alpha=0.6, label="PDF")
        xs = np.sort(x); cdf = np.arange(1, len(xs)+1)/len(xs)
        axh.plot(xs, cdf, label="CDF")
        axh.legend()
        axh.set_xlabel("error [deg]")
    _savefig(os.path.join(outdir, f"{fname_prefix}_error.png"), fig)

def plot_tau_and_motors(t, tau_x, tau_y, m1, m2, m3, m4, outdir=".", prefix="effort"):
    t = _ensure_1d(t)
    fig, axes = plt.subplots(3, 1, figsize=(9,9), sharex=True)

    # τx, τy
    axes[0].plot(t, _ensure_1d(tau_x), label="τx")
    axes[0].plot(t, _ensure_1d(tau_y), label="τy")
    axes[0].set_ylabel("τ [u]"); axes[0].legend(); axes[0].set_title("Esfuerzo de control")

    # Motores
    axes[1].plot(t, _ensure_1d(m1), label="M1")
    axes[1].plot(t, _ensure_1d(m2), label="M2")
    axes[1].plot(t, _ensure_1d(m3), label="M3")
    axes[1].plot(t, _ensure_1d(m4), label="M4")
    axes[1].set_ylabel("PWM/u"); axes[1].legend(); axes[1].set_title("Motores")

    # Deltas y thrust proxy
    M1, M2, M3, M4 = map(_ensure_1d, (m1, m2, m3, m4))
    thrust = M1+M2+M3+M4
    d_roll  = (M2+M4) - (M1+M3)   # ajusta según tu mixer real
    d_pitch = (M1+M2) - (M3+M4)   # ajusta según tu mixer real

    axes[2].plot(t, thrust, label="Σ motores (thrust proxy)")
    axes[2].plot(t, d_roll, label="roll-diff")
    axes[2].plot(t, d_pitch, label="pitch-diff")
    axes[2].set_xlabel("Time [s]"); axes[2].set_ylabel("u")
    axes[2].legend(); axes[2].set_title("Proxies derivados")

    _savefig(os.path.join(outdir, f"{prefix}_tau_motors.png"), fig)

    # Scatter: relación esfuerzo |τ| vs diffs motores (magnitud)
    import numpy as np
    tx = np.abs(_ensure_1d(tau_x)); ty = np.abs(_ensure_1d(tau_y))
    fig2, (axr, axp) = plt.subplots(1, 2, figsize=(10,4))
    axr.scatter(np.abs(d_roll), tx, s=10, alpha=0.6)
    axr.set_xlabel("|roll-diff|"); axr.set_ylabel("|τx|"); axr.set_title("Esfuerzo vs motor roll-diff")
    axp.scatter(np.abs(d_pitch), ty, s=10, alpha=0.6)
    axp.set_xlabel("|pitch-diff|"); axp.set_ylabel("|τy|"); axp.set_title("Esfuerzo vs motor pitch-diff")
    _savefig(os.path.join(outdir, f"{prefix}_scatter_tau_vs_motorDiff.png"), fig2)

def _rolling_corr(a, b, fs, win_s=0.5):
    import numpy as np
    a = _ensure_1d(a).astype(float)
    b = _ensure_1d(b).astype(float)
    n = min(len(a), len(b))
    if fs <= 0 or n < 8: return np.array([]), np.array([])
    a = a[:n]; b = b[:n]
    w = max(4, int(win_s * fs))
    out = np.full(n, np.nan)
    for i in range(w, n):
        aa = a[i-w:i]; bb = b[i-w:i]
        sa, sb = np.std(aa), np.std(bb)
        if sa > 0 and sb > 0:
            out[i] = np.corrcoef(aa, bb)[0,1]
    t = np.arange(n)/fs
    return t, out

def plot_rolling_correlations(t, fs, xhat, ref_value, tau_x, tau_y, u_input=None,
                              axis_name="roll", outdir=".", prefix="corr", win_s=0.6):
    """
    - Corr(|error|, |τ|)
    - Corr(|error|, |input|)  [si hay input]
    """
    import numpy as np
    t = _ensure_1d(t); xhat = _ensure_1d(xhat)
    ref = np.full_like(xhat, float(ref_value))
    err_mag = np.abs(ref - xhat)
    tau_mag = np.sqrt(np.maximum(0.0, _ensure_1d(tau_x)**2 + _ensure_1d(tau_y)**2))

    tc1, c1 = _rolling_corr(err_mag, tau_mag, fs, win_s=win_s)

    fig, ax = plt.subplots()
    if tc1.size:
      ax.plot(tc1, c1, label="corr(|error|, |τ|)")
    if u_input is not None:
      u = np.abs(_ensure_1d(u_input).astype(float) - np.nanmedian(u_input))
      tc2, c2 = _rolling_corr(err_mag, u, fs, win_s=win_s)
      if tc2.size: ax.plot(tc2, c2, label="corr(|error|, |input|)")
    ax.axhline(0, color="k", linewidth=0.5)
    ax.set_xlabel("Time [s]"); ax.set_ylabel("ρ (windowed)")
    ax.set_title(f"{axis_name.capitalize()} – Correlaciones móviles (win={win_s:.2f}s)")
    ax.legend()
    _savefig(os.path.join(outdir, f"{prefix}_{axis_name}_rolling_corr.png"), fig)
