import React, { useRef } from "react";
import type { CustomParams } from "../../types/controller";

export default function CustomPanel({
  value,
  onChange,
}: {
  value: CustomParams;
  onChange: (next: CustomParams) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const v = withDefaults(value);

  const upd = <K extends keyof CustomParams>(k: K, x: CustomParams[K]) =>
    onChange({ ...v, [k]: x });

  const reset = () => onChange(withDefaults({}));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(v, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom_params.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        onChange({ ...v, ...parsed });
      } catch {
        alert("Archivo inválido: no es JSON válido.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={reset} className="btn">
          Reset
        </button>
        <button onClick={exportJson} className="btn">
          Export JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => importJson(e.target.files?.[0])}
        />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
        <span className="text-xs text-gray-400 ml-auto">
          Tips: set *i_limit* and *output_limit* to avoid saturation.
        </span>
      </div>
      {/* Filters and measurement */}
      <Section
        title="Filters and measurement"
        hint="Smooths noise and integrates D on measurement if you want more robustness."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Num
            label="Complementary α"
            value={v.complementary_alpha}
            step={0.001}
            min={0}
            max={1}
            onChange={(x) => upd("complementary_alpha", x)}
          />
          <Num
            label="Low-pass (Hz)"
            value={v.lowpass_cut_hz}
            step={1}
            min={1}
            max={500}
            onChange={(x) => upd("lowpass_cut_hz", x)}
          />
          <Num
            label="Notch f0 (Hz)"
            value={v.notch_f0_hz}
            step={1}
            min={0}
            max={1000}
            onChange={(x) => upd("notch_f0_hz", x)}
          />
          <Num
            label="Notch Q"
            value={v.notch_q}
            step={0.1}
            min={0.1}
            max={50}
            onChange={(x) => upd("notch_q", x)}
          />
          <Switch
            label="D on measurement"
            checked={!!v.d_on_measurement}
            onChange={(x) => upd("d_on_measurement", x)}
          />
        </div>
      </Section>
      {/* Feedforward / Model */}
      <Section
        title="Feedforward / Model"
        hint="Accelerates response reducing feedback work."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Num
            label="FF Angle"
            value={v.ff_angle}
            step={0.01}
            min={0}
            max={5}
            onChange={(x) => upd("ff_angle", x)}
          />
          <Num
            label="FF Rate"
            value={v.ff_rate}
            step={0.001}
            min={0}
            max={1}
            onChange={(x) => upd("ff_rate", x)}
          />
          <Num
            label="FF Thrust"
            value={v.ff_thrust}
            step={0.001}
            min={0}
            max={1}
            onChange={(x) => upd("ff_thrust", x)}
          />
        </div>
      </Section>
      {/* SETPOINT SHAPING */}
      <Section
        title="Setpoint Shaping"
        hint="Smooths pilot/auto orders to avoid spikes."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Num
            label="Slew (°/s)"
            value={v.setpoint_slew_dps}
            step={5}
            min={0}
            max={2000}
            onChange={(x) => upd("setpoint_slew_dps", x)}
          />
          <Num
            label="Expo 0..1"
            value={v.setpoint_expo}
            step={0.01}
            min={0}
            max={1}
            onChange={(x) => upd("setpoint_expo", x)}
          />
          <Num
            label="Deadband dps"
            value={v.rate_deadband_dps}
            step={1}
            min={0}
            max={200}
            onChange={(x) => upd("rate_deadband_dps", x)}
          />
        </div>
      </Section>
      {/* ANTI-WINDUP / LIMITS */}
      <Section
        title="Anti-windup and Limits"
        hint="Protects the loop from saturation and integral accumulation."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Num
            label="i_limit"
            value={v.i_limit}
            step={0.01}
            min={0}
            max={5}
            onChange={(x) => upd("i_limit", x)}
          />
          <Num
            label="AW back-calc k"
            value={v.aw_backcalc_k}
            step={0.01}
            min={0}
            max={1}
            onChange={(x) => upd("aw_backcalc_k", x)}
          />
          <Num
            label="Output limit"
            value={v.output_limit}
            step={1}
            min={0}
            max={1000}
            onChange={(x) => upd("output_limit", x)}
          />
          <Num
            label="Stick deadband"
            value={v.stick_deadband}
            step={0.01}
            min={0}
            max={1}
            onChange={(x) => upd("stick_deadband", x)}
          />
        </div>
      </Section>
      {/* MIXER / MOTOR */}
      <Section
        title="Mixer and Motor"
        hint="Adjusts motor envelope and hover throttle."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Num
            label="Motor min"
            value={v.motor_min}
            step={0.01}
            min={0}
            max={1}
            onChange={(x) => upd("motor_min", x)}
          />
          <Num
            label="Motor max"
            value={v.motor_max}
            step={0.01}
            min={0}
            max={1}
            onChange={(x) => upd("motor_max", x)}
          />
          <Num
            label="Hover throttle"
            value={v.hover_throttle}
            step={0.01}
            min={0}
            max={1}
            onChange={(x) => upd("hover_throttle", x)}
          />
          <Num
            label="Failsafe throttle"
            value={v.failsafe_throttle}
            step={0.01}
            min={0}
            max={1}
            onChange={(x) => upd("failsafe_throttle", x)}
          />
          <Switch
            label="Desarmar si vuelco (flip)"
            checked={!!v.disarm_on_flip}
            onChange={(x) => upd("disarm_on_flip", x)}
          />
        </div>
      </Section>
      {/* NOTES */}
      <Section title="Notes">
        <textarea
          value={v.notes ?? ""}
          onChange={(e) => upd("notes", e.target.value)}
          placeholder="Note changes, tests and observations…"
          className="w-full min-h-[90px] rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-500"
        />
      </Section>
    </div>
  );
}

/* ---------- Helpers / UI ---------- */

function withDefaults(x: Partial<CustomParams>): CustomParams {
  return {
    complementary_alpha: x.complementary_alpha ?? 0.991,
    lowpass_cut_hz: x.lowpass_cut_hz ?? 60,
    d_on_measurement: x.d_on_measurement ?? true,

    notch_f0_hz: x.notch_f0_hz ?? 0,
    notch_q: x.notch_q ?? 5,

    ff_angle: x.ff_angle ?? 0.0,
    ff_rate: x.ff_rate ?? 0.0,
    ff_thrust: x.ff_thrust ?? 0.0,

    setpoint_slew_dps: x.setpoint_slew_dps ?? 720,
    setpoint_expo: x.setpoint_expo ?? 0.2,
    rate_deadband_dps: x.rate_deadband_dps ?? 0,

    i_limit: x.i_limit ?? 0.3,
    aw_backcalc_k: x.aw_backcalc_k ?? 0.5,
    output_limit: x.output_limit ?? 400,
    stick_deadband: x.stick_deadband ?? 0.02,

    motor_min: x.motor_min ?? 0.05,
    motor_max: x.motor_max ?? 1.0,
    hover_throttle: x.hover_throttle ?? 0.35,
    failsafe_throttle: x.failsafe_throttle ?? 0.15,
    disarm_on_flip: x.disarm_on_flip ?? true,

    notes: x.notes ?? "",
  };
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-medium text-gray-100">{title}</h4>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const val = Number.isFinite(value as number) ? Number(value) : 0;
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-xs text-gray-300">{label}</label>
      <input
        type="number"
        step={step ?? 0.01}
        min={min}
        max={max}
        value={val}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? clamp(n, min, max) : 0);
        }}
        className="w-full max-w-[10rem] rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-green-500"
      />
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-200">
      <input
        type="checkbox"
        className="h-4 w-4 accent-blue-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function clamp(n: number, min?: number, max?: number) {
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
}
