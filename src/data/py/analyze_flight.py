# src/data/py/analyze_flight.py
import os, sys, json, argparse, logging
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np

from plots import (
    plot_ref_meas_error, plot_psd_raw_vs_kalman, plot_nis,
    plot_acf, plot_latency_hist_cdf, plot_packet_mask
)
import metrics  # tu metrics.py (CLI imprime JSON en otro flujo; aquí lo usamos como módulo)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("analyze_flight")

def load_flight_data(csv_path: str):
    df = pd.read_csv(csv_path, parse_dates=['timestamp'])
    df = df.sort_values('timestamp')
    df['time_seconds'] = (df['timestamp'] - df['timestamp'].iloc[0]).dt.total_seconds()
    meta = {
        'flight_id': str(df['flight_id'].iloc[0]) if 'flight_id' in df.columns else 'unknown',
        'start_time': df['timestamp'].iloc[0].isoformat(),
        'end_time': df['timestamp'].iloc[-1].isoformat(),
        'duration_seconds': float((df['timestamp'].iloc[-1] - df['timestamp'].iloc[0]).total_seconds()),
        'sample_count': int(len(df)),
        'sampling_rate_hz': float(len(df) / max(df['time_seconds'].iloc[-1] - df['time_seconds'].iloc[0], 1e-9))
    }
    return df, meta

def _estimate_fs(t_s: np.ndarray) -> float:
    if len(t_s) < 2: return 0.0
    dt = np.diff(t_s); dt = dt[(dt>0) & np.isfinite(dt)]
    return 1.0/float(np.median(dt)) if len(dt) else 0.0

def generate_plots(df: pd.DataFrame, outdir: str):
    os.makedirs(outdir, exist_ok=True)
    plots = []
    t = df["time_seconds"].to_numpy()
    if len(t) < 2: return plots
    fs = _estimate_fs(t)

    ref_roll  = df["ref_roll"].to_numpy()  if "ref_roll"  in df.columns else np.zeros_like(t)
    ref_pitch = df["ref_pitch"].to_numpy() if "ref_pitch" in df.columns else np.zeros_like(t)
    roll_raw  = df["angle_roll"].to_numpy()
    roll_est  = df["angle_roll_est"].to_numpy()
    pitch_raw = df["angle_pitch"].to_numpy()
    pitch_est = df["angle_pitch_est"].to_numpy()

    def add(ok, path): 
        if ok: plots.append(path)

    p = os.path.join(outdir, "roll_ref_meas_err.png")
    try: plot_ref_meas_error(t, ref_roll, roll_est, "Roll: ref vs est & error", p); add(True,p)
    except Exception: pass

    p = os.path.join(outdir, "pitch_ref_meas_err.png")
    try: plot_ref_meas_error(t, ref_pitch, pitch_est, "Pitch: ref vs est & error", p); add(True,p)
    except Exception: pass

    p = os.path.join(outdir, "psd_roll_raw_vs_kalman.png")
    try: plot_psd_raw_vs_kalman(roll_raw, roll_est, fs, "PSD Roll: raw vs kalman", p); add(True,p)
    except Exception: pass

    p = os.path.join(outdir, "psd_pitch_raw_vs_kalman.png")
    try: plot_psd_raw_vs_kalman(pitch_raw, pitch_est, fs, "PSD Pitch: raw vs kalman", p); add(True,p)
    except Exception: pass

    if {"innov_roll","S_roll"} <= set(df.columns):
        p = os.path.join(outdir, "nis_roll.png")
        try: plot_nis(t, df["innov_roll"].to_numpy(), df["S_roll"].to_numpy(), 1, "NIS Roll", p); add(True,p)
        except Exception: pass

    if {"innov_pitch","S_pitch"} <= set(df.columns):
        p = os.path.join(outdir, "nis_pitch.png")
        try: plot_nis(t, df["innov_pitch"].to_numpy(), df["S_pitch"].to_numpy(), 1, "NIS Pitch", p); add(True,p)
        except Exception: pass

    resid_roll  = (roll_raw - roll_est)   if len(roll_raw)==len(roll_est)     else None
    resid_pitch = (pitch_raw - pitch_est) if len(pitch_raw)==len(pitch_est)   else None

    if resid_roll is not None and len(resid_roll):
        p = os.path.join(outdir, "acf_resid_roll.png")
        try: plot_acf(resid_roll, nlags=min(60, len(resid_roll)//2), title="ACF Residuals Roll", outpath=p); add(True,p)
        except Exception: pass

    if resid_pitch is not None and len(resid_pitch):
        p = os.path.join(outdir, "acf_resid_pitch.png")
        try: plot_acf(resid_pitch, nlags=min(60, len(resid_pitch)//2), title="ACF Residuals Pitch", outpath=p); add(True,p)
        except Exception: pass

    if "latency_ms" in df.columns:
        lat = df["latency_ms"].dropna().to_numpy()
        if lat.size:
            p = os.path.join(outdir, "latency_hist_cdf.png")
            try: plot_latency_hist_cdf(lat, "Latency MCU→UI (ms)", p); add(True,p)
            except Exception: pass

    if "packet_received" in df.columns:
        p = os.path.join(outdir, "packet_rate.png")
        try: plot_packet_mask(t, df["packet_received"].to_numpy(), "Packet received (1)/lost(0)", p); add(True,p)
        except Exception: pass

    return plots

def main():
    # Initialize process_start_time at function scope
    process_start_time = datetime.now().isoformat()
    
    ap = argparse.ArgumentParser(description="Analyze flight CSV -> metrics + figures")
    ap.add_argument("input_csv")
    ap.add_argument("--output-dir", default="output")
    ap.add_argument("--plot", action="store_true")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stderr)
        ]
    )
    logger = logging.getLogger("analyze_flight")
    
    logger.info("Starting flight analysis with args: %s", args)
    logger.debug("Process start time: %s", process_start_time)
    
    try:
        # Ensure output directory exists first
        os.makedirs(args.output_dir, exist_ok=True)
        
        # Save process info for debugging
        with open(os.path.join(args.output_dir, "process_info.json"), 'w') as f:
            json.dump({
                "process_start_time": process_start_time,
                "input_file": os.path.abspath(args.input_csv),
                "output_dir": os.path.abspath(args.output_dir),
                "python_version": sys.version,
                "platform": sys.platform,
                "argv": sys.argv
            }, f, indent=2)
        
        logger.debug("Loading flight data from %s", args.input_csv)
        df, meta = load_flight_data(args.input_csv)
        meta['process_start_time'] = process_start_time
        
        logger.debug("Converting to records and computing metrics")
        rows = df.to_dict("records")
        
        logger.debug("Computing metrics...")
        result = metrics.compute(rows)
        
        # Save results with metadata
        output_path = os.path.join(args.output_dir, "flight_metrics.json")
        logger.debug("Saving results to %s", output_path)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump({"metadata": meta, "metrics": result}, f, indent=2)
        logger.info("Analysis completed successfully. Results saved to %s", output_path)

        # Generate plots if requested
        if args.plot:
            logger.debug("Generating plots...")
            try:
                figs = generate_plots(df, args.output_dir)
                logger.info("Generated %d figures in %s", len(figs), args.output_dir)
            except Exception as plot_error:
                logger.error("Error generating plots: %s", str(plot_error), exc_info=args.debug)
                raise
            
    except Exception as e:
        error_msg = f"Error during analysis: {str(e)}"
        logger.error(error_msg, exc_info=args.debug)
        
        # Create detailed error information
        error_info = {
            "error": str(e),
            "error_type": type(e).__name__,
            "timestamp": datetime.now().isoformat(),
            "process_start_time": process_start_time,
            "input_file": os.path.abspath(args.input_csv) if 'args' in locals() else 'unknown',
            "python_version": sys.version,
            "platform": sys.platform,
            "traceback": []
        }
        
        # Add traceback information if available
        if hasattr(e, '__traceback__'):
            import traceback
            error_info["traceback"] = traceback.format_tb(e.__traceback__)
        
        # Save error information to file
        error_path = os.path.join(args.output_dir if 'args' in locals() else '.', "analysis_error.json")
        try:
            with open(error_path, "w", encoding="utf-8") as f:
                json.dump(error_info, f, indent=2)
            logger.error("Detailed error information saved to %s", error_path)
        except Exception as save_error:
            logger.error("Failed to save error details: %s", str(save_error))
            # Try to write to stderr as last resort
            print(f"CRITICAL: Could not save error details: {save_error}", file=sys.stderr)
            print(f"Original error: {error_info}", file=sys.stderr)
        
        # Re-raise to ensure the error is caught by the calling code
        raise RuntimeError(error_msg) from e

if __name__ == "__main__":
    main()
