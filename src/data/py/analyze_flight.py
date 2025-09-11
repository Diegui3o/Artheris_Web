import os, sys, json, math, argparse
import numpy as np
import pandas as pd
from typing import Optional
from pathlib import Path
import metrics as M
from pro import run_pro_analysis

# Parse command line arguments
def parse_args():
    p = argparse.ArgumentParser(description="Analyze flight CSV -> JSONs")
    p.add_argument("input_csv", help="Ruta del CSV de vuelo")
    p.add_argument("--output-dir", "-o", default="out", help="Carpeta de salida")
    p.add_argument("--plot", action="store_true", help="(opcional) generar PNGs si los tuvieras")
    p.add_argument("--pro", action="store_true", help="Exportar análisis PRO (pasos/FRF/latencia)")
    return p.parse_args()

# ---------- helpers de export para las gráficas ----------
def _estimate_fs(time_series: np.ndarray) -> float:
    if len(time_series) < 3:
        return 100.0
    diffs = np.diff(time_series)
    diffs = diffs[(diffs > 0) & np.isfinite(diffs)]
    if len(diffs) == 0:
        return 100.0
    # trim outliers (5–95 pct)
    lo, hi = np.percentile(diffs, [5, 95])
    diffs = diffs[(diffs >= lo) & (diffs <= hi)]
    if len(diffs) == 0:
        return 100.0
    return float(1.0 / np.median(diffs))

def _decimate_same_step(*arrays, max_points=50_000):
    if not arrays:
        return []
    n = len(arrays[0])
    step = 1 if n <= max_points else max(1, int(math.ceil(n / max_points)))
    return [np.asarray(a)[::step] for a in arrays]

def _decimate(arr, max_points=50_000):
    arr = np.asarray(arr)
    if arr.size <= max_points:
        return arr
    step = max(1, int(math.ceil(arr.size / max_points)))
    return arr[::step]

def _psd_export(y, fs):
    y = np.asarray(y, dtype=float)
    if y.size < 8 or fs <= 0:
        return {"freq_hz": [], "power": []}
    y = y - np.nanmean(y)
    w = np.hanning(y.size)
    yw = y * w
    U = (w**2).sum()  # corrección de potencia de la ventana
    yf = np.fft.rfft(yw, n=yw.size)
    freqs = np.fft.rfftfreq(yw.size, d=1.0/fs)
    psd = (np.abs(yf) ** 2) / (U * fs)  # densidad unilateral aprox
    return {"freq_hz": _decimate(freqs).tolist(), "power": _decimate(psd).tolist()}

# ---------- helpers de export para las gráficas ----------
def save_plot_payloads(df: pd.DataFrame, outdir: str, pro_payload=None):
    """
    Exporta plot_data.json con diezmado consistente (mismo step para todas las series),
    agrega meta.units/meta.labels y escribe CSVs de puntos (roll/pitch).
    """
    os.makedirs(outdir, exist_ok=True)

    # Base temporal y fs
    t_full = df["time_seconds"].to_numpy()
    fs = _estimate_fs(t_full)

    # Helper para obtener columnas con default y tipo float
    def col(name, default=None):
        if name in df.columns:
            return df[name].to_numpy(dtype=float)
        if default is None:
            return None
        return np.full_like(t_full, default, dtype=float)

    # Series estándar
    roll_raw   = col("angle_roll")
    roll_est   = col("angle_roll_est")
    pitch_raw  = col("angle_pitch")
    pitch_est  = col("angle_pitch_est")

    # Opcionales
    ref_roll   = col("ref_roll")
    ref_pitch  = col("ref_pitch")
    err_phi    = col("error_phi")
    err_theta  = col("error_theta")
    tau_x      = col("tau_x")
    tau_y      = col("tau_y")
    tau_z      = col("tau_z")

    # ---------- Diezmado CONSISTENTE ----------
    # Calcula un único step con base en t_full y úsalo para TODAS las series del mismo largo.
    max_points = 50_000
    n = len(t_full)
    step = 1 if n <= max_points else max(1, int(math.ceil(n / max_points)))
    def d(arr):
        if arr is None: 
            return None
        a = np.asarray(arr)
        return a[::step] if a.size > 0 else a

    t = t_full[::step]

    roll_raw_d  = d(roll_raw)
    roll_est_d  = d(roll_est)
    pitch_raw_d = d(pitch_raw)
    pitch_est_d = d(pitch_est)
    ref_roll_d  = d(ref_roll)
    ref_pitch_d = d(ref_pitch)
    err_phi_d   = d(err_phi)
    err_theta_d = d(err_theta)
    tau_x_d     = d(tau_x)
    tau_y_d     = d(tau_y)
    tau_z_d     = d(tau_z)

    # ---------- PSDs (pueden usar arrays completos para mejor resolución) ----------
    psd = {
        "roll_raw":  _psd_export(roll_raw,  fs),
        "roll_est":  _psd_export(roll_est,  fs),
        "pitch_raw": _psd_export(pitch_raw, fs),
        "pitch_est": _psd_export(pitch_est, fs),
    }

    # ---------- Meta enriquecida ----------
    meta = {
        "fs_hz": float(fs),
        "n": int(len(t_full)),
        "columns": list(df.columns),
        "units": {
            "time_s": "s",
            "angle_roll": "deg",
            "angle_roll_est": "deg",
            "angle_pitch": "deg",
            "angle_pitch_est": "deg",
            "ref_roll": "deg",
            "ref_pitch": "deg",
            "error_phi": "deg",
            "error_theta": "deg",
            "tau_x": "arb",  # ajusta a N·m si corresponde
            "tau_y": "arb",
            "tau_z": "arb",
        },
        "labels": {
            "roll_raw": "Roll (medido)",
            "roll_est": "Roll (estimado)",
            "roll_ref": "Roll (referencia)",
            "pitch_raw": "Pitch (medido)",
            "pitch_est": "Pitch (estimado)",
            "pitch_ref": "Pitch (referencia)",
            "phi_error": "Error Roll (φ)",
            "theta_error": "Error Pitch (θ)",
            "tau_x": "Torque X",
            "tau_y": "Torque Y",
            "tau_z": "Torque Z",
        },
        # útil para la UI: step de diezmado utilizado
        "decimation_step": int(step),
    }

    payload = {
        "meta": meta,
        "time_s": t.tolist(),
        "roll": {
            "raw":  (roll_raw_d.tolist()  if roll_raw_d  is not None else None),
            "est":  (roll_est_d.tolist()  if roll_est_d  is not None else None),
            "ref":  (ref_roll_d.tolist()  if ref_roll_d  is not None else None),
        },
        "pitch": {
            "raw":  (pitch_raw_d.tolist() if pitch_raw_d is not None else None),
            "est":  (pitch_est_d.tolist() if pitch_est_d is not None else None),
            "ref":  (ref_pitch_d.tolist() if ref_pitch_d is not None else None),
        },
        "errors": {
            "phi":   (err_phi_d.tolist()   if err_phi_d   is not None else None),
            "theta": (err_theta_d.tolist() if err_theta_d is not None else None),
        },
        "control": {
            "tau_x": (tau_x_d.tolist() if tau_x_d is not None else None),
            "tau_y": (tau_y_d.tolist() if tau_y_d is not None else None),
            "tau_z": (tau_z_d.tolist() if tau_z_d is not None else None),
        },
        "psd": psd,
    }
    if pro_payload is not None:
        payload["pro"] = pro_payload

    # Escribe JSON
    Path(outdir, "plot_data.json").write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8"
    )

    # ---------- CSVs de puntos (diezmados) ----------
    def write_points_csv(name, y_raw, y_est, y_ref=None):
        p = Path(outdir, f"{name}_points.csv")
        cols = ["t_s", "raw", "est"] + (["ref"] if y_ref is not None else [])
        n = len(t)
        with p.open("w", encoding="utf-8") as f:
            f.write(",".join(cols) + "\n")
            for i in range(n):
                row = [t[i],
                       (y_raw[i] if y_raw is not None and i < len(y_raw) else ""),
                       (y_est[i] if y_est is not None and i < len(y_est) else "")]
                if y_ref is not None and i < len(y_ref):
                    row.append(y_ref[i])
                f.write(",".join(str(x) if x is not None else "" for x in row) + "\n")

    # Genera roll/pitch si existen
    if roll_raw_d is not None or roll_est_d is not None:
        write_points_csv("roll", roll_raw_d, roll_est_d, ref_roll_d)
    if pitch_raw_d is not None or pitch_est_d is not None:
        write_points_csv("pitch", pitch_raw_d, pitch_est_d, ref_pitch_d)


def read_flight_data(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, parse_dates=["timestamp"])
    # time_seconds
    if "time_seconds" not in df.columns:
        # alias de tiempo si viniera con otro nombre
        time_aliases = ["time_s", "t", "Time", "time"]
        aliased = next((c for c in time_aliases if c in df.columns), None)
        if aliased is not None:
            df["time_seconds"] = pd.to_numeric(df[aliased], errors="coerce")
        elif "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            df["time_seconds"] = (df["timestamp"] - df["timestamp"].iloc[0]).dt.total_seconds()
        else:
            # fallback a 100 Hz
            df["time_seconds"] = np.arange(len(df), dtype=float) * 0.01

    # ordena por tiempo y quita duplicados si hubiera
    df = df.sort_values("time_seconds", kind="mergesort").drop_duplicates(subset=["time_seconds"])

    aliases = {
        "roll": "angle_roll",
        "pitch": "angle_pitch",
        "KalmanAngleRoll": "angle_roll_est",
        "KalmanAnglePitch": "angle_pitch_est",
    }
    for src, dst in aliases.items():
        if src in df.columns and dst not in df.columns:
            df[dst] = df[src]

    required = ["time_seconds", "angle_roll", "angle_pitch", "angle_roll_est", "angle_pitch_est"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(missing)}")

    # errores si no vienen
    df["error_phi"] = df.get("error_phi", df["angle_roll"] - df["angle_roll_est"])
    df["error_theta"] = df.get("error_theta", df["angle_pitch"] - df["angle_pitch_est"])
    return df

def main():
    args = parse_args()
    outdir = Path(args.output_dir)
    outdir.mkdir(parents=True, exist_ok=True)

    try:
        # 1) leer & preparar
        df = read_flight_data(args.input_csv)

        # 1.5) si se pidió PRO, calcúlalo primero
        pro_payload = None
        pro_metrics = None
        if args.pro:
            try:
                pro_payload, pro_metrics = run_pro_analysis(df)
            except Exception as e:
                print(f"[warn] PRO analysis failed: {e}", file=sys.stderr)

        # 2) plot payloads (inyecta pro si existe)
        save_plot_payloads(df, str(outdir), pro_payload=pro_payload)

        # 3) métricas -> flight_metrics.json (usando tu metrics.py)
        try:
            rows = df.to_dict(orient="records")
            metrics = M.compute(rows)  # llama a metrics.compute(...)
            # adjunta PRO si existe (no rompe tu UI)
            if pro_metrics:
                if isinstance(metrics, dict) and isinstance(metrics.get("metrics"), dict):
                    metrics["metrics"]["pro"] = pro_metrics
                else:
                    metrics["pro"] = pro_metrics
        except Exception as e:
            fs_est = float(1.0 / max(1e-9, df["time_seconds"].diff().median())) if "time_seconds" in df.columns else 0.0
            dur_s = float(df["time_seconds"].iloc[-1] - df["time_seconds"].iloc[0]) if "time_seconds" in df.columns else 0.0
            metrics = {
                "ok": True,
                "inputs": {"num_samples": int(len(df)), "fs_hz_est": fs_est, "duration_s": dur_s},
                "metrics": {}
            }

        Path(outdir, "flight_metrics.json").write_text(
            json.dumps(metrics, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        print(f"Analysis complete. Results saved to {outdir}")
        return 0
    except Exception as e:
        print(f"Error processing flight data: {e}", file=sys.stderr)
        import traceback; traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())