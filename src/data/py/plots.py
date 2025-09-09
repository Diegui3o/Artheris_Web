# src/data/py/plots.py
import os, math
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

def _ensure_1d(a):
    return np.asarray(a).reshape(-1)

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

def plot_nis(t, innov, S, m, title, outpath):
    t = _ensure_1d(t)
    v = _ensure_1d(innov)
    S = _ensure_1d(S)
    if not len(t) or not len(v) or not len(S): return
    nis = (v*v)/np.maximum(S, 1e-12)
    fig, ax = plt.subplots()
    ax.plot(t, nis, label="NIS")
    # banda χ² (gdl=m, 95%)
    try:
        from scipy.stats import chi2
        lo, hi = chi2.ppf(0.025, m), chi2.ppf(0.975, m)
    except Exception:
        # Wilson–Hilferty approx
        z = 1.96; k = m
        def q(sign): return k*(1 - 2/(9*k) + sign*z*np.sqrt(2/(9*k)))**3
        lo, hi = q(-1), q(1)
    ax.axhline(lo, linestyle="--", label="χ² lower")
    ax.axhline(hi, linestyle="--", label="χ² upper")
    ax.set_xlabel("Time [s]"); ax.set_title(title); ax.legend()
    _savefig(outpath, fig)

def _acf(x, nlags=60):
    x = _ensure_1d(x) - np.mean(x)
    if len(x) == 0: return np.arange(nlags+1), np.zeros(nlags+1)
    c = np.correlate(x, x, mode="full")
    mid = c.size//2
    c = c[mid:mid+nlags+1]
    c = c / (c[0] if c[0] else 1)
    lags = np.arange(nlags+1)
    return lags, c

def plot_acf(resid, nlags, title, outpath):
    lags, r = _acf(resid, nlags)
    fig, ax = plt.subplots()
    ax.stem(lags, r, use_line_collection=True)
    ax.set_xlabel("Lag"); ax.set_ylabel("ACF"); ax.set_title(title)
    _savefig(outpath, fig)

def plot_latency_hist_cdf(lat_ms, title, outpath):
    x = _ensure_1d(lat_ms)
    if not len(x): return
    x = x[np.isfinite(x)]
    if not len(x): return
    fig, ax = plt.subplots()
    ax.hist(x, bins=30, density=True, alpha=0.6, label="hist")
    xs = np.sort(x); cdf = np.arange(1, len(xs)+1)/len(xs)
    ax.plot(xs, cdf, label="CDF")
    ax.set_xlabel("Latency [ms]"); ax.set_title(title); ax.legend()
    _savefig(outpath, fig)

def plot_packet_mask(t, received_mask, title, outpath):
    t = _ensure_1d(t); m = _ensure_1d(received_mask)
    fig, ax = plt.subplots()
    ax.step(t, m, where="post", label="received (1)/lost (0)")
    ax.set_xlabel("Time [s]"); ax.set_title(title); ax.legend()
    _savefig(outpath, fig)

def plot_compare_bars(categories, A, B, labels=("A","B"), title="", outpath=""):
    cats = list(categories)
    A = _ensure_1d(A); B = _ensure_1d(B)
    x = np.arange(len(cats)); w = 0.35
    fig, ax = plt.subplots()
    ax.bar(x-w/2, A, w, label=labels[0])
    ax.bar(x+w/2, B, w, label=labels[1])
    ax.set_xticks(x); ax.set_xticklabels(cats, rotation=20, ha="right")
    ax.set_title(title); ax.legend()
    _savefig(outpath, fig)

def plot_heatmap(M, xlabels, ylabels, title, outpath):
    M = np.asarray(M)
    fig, ax = plt.subplots()
    im = ax.imshow(M, aspect="auto", origin="lower")
    ax.set_xticks(np.arange(len(xlabels))); ax.set_xticklabels(xlabels, rotation=45, ha="right")
    ax.set_yticks(np.arange(len(ylabels))); ax.set_yticklabels(ylabels)
    ax.set_title(title); fig.colorbar(im, ax=ax)
    _savefig(outpath, fig)
