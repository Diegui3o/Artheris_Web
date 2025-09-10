import os, sys, json, math, argparse
import numpy as np
import pandas as pd
from typing import Optional
from pathlib import Path
import metrics as M
import importlib
from pro import run_pro_analysis

# Parse command line arguments
def parse_args():
    p = argparse.ArgumentParser(description="Analyze flight CSV -> JSONs")
    p.add_argument("input_csv", help="Ruta del CSV de vuelo")
    p.add_argument("--output-dir", "-o", default="out", help="Carpeta de salida")
    p.add_argument("--plot", action="store_true", help="(opcional) generar PNGs si los tuvieras")
    p.add_argument("--pro", action="store_true", help="Exportar análisis PRO (pasos/FRF/latencia)")
    return p.parse_args()

# Global variables
pro_payload = None
pro_metrics = None

# ---------- helpers de export para las gráficas ----------
def _estimate_fs(time_series: np.ndarray) -> float:
    if len(time_series) < 2:
        return 100.0
    diffs = np.diff(time_series)
    diffs = diffs[diffs > 0]
    if len(diffs) == 0:
        return 100.0
    median_dt = np.median(diffs)
    return float(1.0 / median_dt)

def _decimate(arr, max_points=50_000):
    arr = np.asarray(arr)
    if arr.size <= max_points:
        return arr
    step = max(1, int(math.ceil(arr.size / max_points)))
    return arr[::step]

def _psd_export(y, fs):
    y = np.asarray(y, dtype=float)
    if y.size < 4 or fs <= 0:
        return {"freq_hz": [], "power": []}
    y = y - np.nanmean(y)
    yf = np.fft.rfft(y)
    freqs = np.fft.rfftfreq(len(y), d=1.0/fs)
    power = (np.abs(yf)**2) / len(y)
    return {"freq_hz": _decimate(freqs).tolist(), "power": _decimate(power).tolist()}

def save_plot_payloads(df: pd.DataFrame, outdir: str, pro_payload=None):
    os.makedirs(outdir, exist_ok=True)
    t = df["time_seconds"].to_numpy()
    fs = _estimate_fs(t)

    def col(name, default=0.0):
        return df[name].to_numpy() if name in df.columns else np.full_like(t, default, dtype=float)

    roll_raw   = col("angle_roll")
    roll_est   = col("angle_roll_est")
    pitch_raw  = col("angle_pitch")
    pitch_est  = col("angle_pitch_est")
    ref_roll   = df["ref_roll"].to_numpy()  if "ref_roll"  in df.columns else None
    ref_pitch  = df["ref_pitch"].to_numpy() if "ref_pitch" in df.columns else None
    err_phi    = df["error_phi"].to_numpy()   if "error_phi"   in df.columns else None
    err_theta  = df["error_theta"].to_numpy() if "error_theta" in df.columns else None
    tau_x      = df["tau_x"].to_numpy() if "tau_x" in df.columns else None
    tau_y      = df["tau_y"].to_numpy() if "tau_y" in df.columns else None
    tau_z      = df["tau_z"].to_numpy() if "tau_z" in df.columns else None

    payload = {
        "meta": {"fs_hz": float(fs), "n": int(len(t)), "columns": list(df.columns)},
        "time_s": _decimate(t).tolist(),
        "roll":  {"raw": _decimate(roll_raw).tolist(),  "est": _decimate(roll_est).tolist(),
                  "ref": (_decimate(ref_roll).tolist()  if ref_roll  is not None else None)},
        "pitch": {"raw": _decimate(pitch_raw).tolist(), "est": _decimate(pitch_est).tolist(),
                  "ref": (_decimate(ref_pitch).tolist() if ref_pitch is not None else None)},
        "errors":  {"phi": (_decimate(err_phi).tolist() if err_phi   is not None else None),
                    "theta": (_decimate(err_theta).tolist() if err_theta is not None else None)},
        "control": {"tau_x": (_decimate(tau_x).tolist() if tau_x is not None else None),
                    "tau_y": (_decimate(tau_y).tolist() if tau_y is not None else None),
                    "tau_z": (_decimate(tau_z).tolist() if tau_z is not None else None)},
        "psd": {
            "roll_raw":  _psd_export(roll_raw,  fs),
            "roll_est":  _psd_export(roll_est,  fs),
            "pitch_raw": _psd_export(pitch_raw, fs),
            "pitch_est": _psd_export(pitch_est, fs),
        },
    }
    if pro_payload is not None:
        payload["pro"] = pro_payload
    plot_path = Path(outdir, "plot_data.json")
    plot_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    # Write points CSV files
    def write_points_csv(name, y_raw, y_est, y_ref=None):
        p = Path(outdir, f"{name}_points.csv")
        t = df["time_seconds"].to_numpy()
        cols = ["t_s", "raw", "est"] + (["ref"] if y_ref is not None else [])
        with p.open("w", encoding="utf-8") as f:
            f.write(",".join(cols) + "\n")
            for i in range(len(y_raw)):
                row = [t[i], y_raw[i], y_est[i]]
                if y_ref is not None: 
                    row.append(y_ref[i] if i < len(y_ref) else "")
                f.write(",".join(str(x) if x is not None else "" for x in row) + "\n")

    # Generate CSV files for roll and pitch
    if len(roll_raw) > 0 and len(roll_est) > 0:
        write_points_csv("roll", roll_raw, roll_est, ref_roll if ref_roll is not None else None)
    if len(pitch_raw) > 0 and len(pitch_est) > 0:
        write_points_csv("pitch", pitch_raw, pitch_est, ref_pitch if ref_pitch is not None else None)

# ---------- lectura del CSV y normalización mínima ----------
def read_flight_data(csv_path: str) -> pd.DataFrame:
    # OJO: infer_datetime_format está deprecado; no hace falta.
    df = pd.read_csv(csv_path, parse_dates=["timestamp"])
    # time_seconds desde el primer timestamp
    if "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        df["time_seconds"] = (df["timestamp"] - df["timestamp"].iloc[0]).dt.total_seconds()
    elif "time_seconds" not in df.columns:
        # fallback simple si no hay timestamp
        df["time_seconds"] = np.arange(len(df), dtype=float) * 0.01  # 100 Hz supuesta

    # Normaliza nombres básicos si vienen con alias
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

    # Si no hay errores explícitos, calcúlalos
    if "error_phi" not in df.columns:
        df["error_phi"] = df["angle_roll"] - df["angle_roll_est"]
    if "error_theta" not in df.columns:
        df["error_theta"] = df["angle_pitch"] - df["angle_pitch_est"]

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