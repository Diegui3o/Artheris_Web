import type {
  PIDGains,
  PIDAxisSimple,
  PIDAxisCascade,
  PIDAxisRate,
} from "../../types/controller";
import React from "react";

/* ---- Type guards ---- */
type PIDAxis = PIDAxisSimple | PIDAxisCascade | PIDAxisRate;
const isSimple = (a: PIDAxis | undefined): a is PIDAxisSimple =>
  a?.kind === "simple";
const isCascade = (a: PIDAxis | undefined): a is PIDAxisCascade =>
  a?.kind === "cascade";
const isRate = (a: PIDAxis | undefined): a is PIDAxisRate => a?.kind === "rate";

/* ---- Sub-editores ---- */
function SimpleEditor({
  v,
  on,
}: {
  v: PIDAxisSimple;
  on: (next: PIDAxisSimple) => void;
}) {
  const upd = (k: keyof PIDAxisSimple, val: number) =>
    on({ ...v, [k]: Number.isFinite(val) ? val : 0 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Kp">
          <Num value={v.kp} onChange={(x) => upd("kp", x)} step={0.01} />
        </Field>
        <Field label="Ki">
          <Num value={v.ki} onChange={(x) => upd("ki", x)} step={0.001} />
        </Field>
        <Field label="Kd">
          <Num value={v.kd} onChange={(x) => upd("kd", x)} step={0.001} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="i_limit">
          <Num
            value={v.i_limit ?? 0.3}
            onChange={(x) => upd("i_limit", x)}
            step={0.01}
          />
        </Field>
        <Field label="d_cut_hz">
          <Num
            value={v.d_cut_hz ?? 60}
            onChange={(x) => upd("d_cut_hz", x)}
            step={1}
          />
        </Field>
      </div>
    </div>
  );
}

function RateEditor({
  v,
  on,
}: {
  v: PIDAxisRate;
  on: (next: PIDAxisRate) => void;
}) {
  const upd = (k: keyof PIDAxisRate, val: number) =>
    on({ ...v, [k]: Number.isFinite(val) ? val : 0 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Kp">
          <Num value={v.kp} onChange={(x) => upd("kp", x)} step={0.01} />
        </Field>
        <Field label="Ki">
          <Num value={v.ki} onChange={(x) => upd("ki", x)} step={0.001} />
        </Field>
        <Field label="Kd">
          <Num value={v.kd} onChange={(x) => upd("kd", x)} step={0.001} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="i_limit">
          <Num
            value={v.i_limit ?? 0.3}
            onChange={(x) => upd("i_limit", x)}
            step={0.01}
          />
        </Field>
        <Field label="d_cut_hz">
          <Num
            value={v.d_cut_hz ?? 60}
            onChange={(x) => upd("d_cut_hz", x)}
            step={1}
          />
        </Field>
      </div>
    </div>
  );
}

function CascadeEditor({
  v,
  on,
}: {
  v: PIDAxisCascade;
  on: (next: PIDAxisCascade) => void;
}) {
  const updAngle = (k: keyof PIDAxisCascade["angle"], val: number) =>
    on({ ...v, angle: { ...v.angle, [k]: Number.isFinite(val) ? val : 0 } });
  const updRate = (k: keyof PIDAxisCascade["rate"], val: number) =>
    on({ ...v, rate: { ...v.rate, [k]: Number.isFinite(val) ? val : 0 } });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <h5 className="mb-3 font-medium text-gray-100">
          Lazo Externo (Ángulo)
        </h5>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Kp">
            <Num
              value={v.angle.kp}
              onChange={(x) => updAngle("kp", x)}
              step={0.01}
            />
          </Field>
          <Field label="Ki">
            <Num
              value={v.angle.ki ?? 0}
              onChange={(x) => updAngle("ki", x)}
              step={0.001}
            />
          </Field>
          <Field label="Kd">
            <Num
              value={v.angle.kd ?? 0}
              onChange={(x) => updAngle("kd", x)}
              step={0.001}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <h5 className="mb-3 font-medium text-gray-100">Lazo Interno (Rate)</h5>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Kp">
            <Num
              value={v.rate.kp}
              onChange={(x) => updRate("kp", x)}
              step={0.01}
            />
          </Field>
          <Field label="Ki">
            <Num
              value={v.rate.ki}
              onChange={(x) => updRate("ki", x)}
              step={0.001}
            />
          </Field>
          <Field label="Kd">
            <Num
              value={v.rate.kd}
              onChange={(x) => updRate("kd", x)}
              step={0.001}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="i_limit">
            <Num
              value={v.rate.i_limit ?? 0.3}
              onChange={(x) => updRate("i_limit", x)}
              step={0.01}
            />
          </Field>
          <Field label="d_cut_hz">
            <Num
              value={v.rate.d_cut_hz ?? 60}
              onChange={(x) => updRate("d_cut_hz", x)}
              step={1}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* ---- Tarjeta por eje ---- */
function AxisCard({
  title,
  axis,
  value,
  onChange,
  allowRateOnly = false,
}: {
  title: string;
  axis: "roll" | "pitch" | "yaw";
  value: PIDGains;
  onChange: (next: PIDGains) => void;
  allowRateOnly?: boolean;
}) {
  const vAxis = value[axis] as PIDAxis;

  const setMode = (mode: "simple" | "cascade" | "rate") => {
    let nextAxis: PIDAxis;
    if (mode === "simple") {
      nextAxis = isSimple(vAxis)
        ? vAxis
        : {
            kind: "simple",
            kp: 0.1,
            ki: 0.02,
            kd: 0.001,
            i_limit: 0.3,
            d_cut_hz: 60,
          };
    } else if (mode === "rate") {
      nextAxis = isRate(vAxis)
        ? vAxis
        : {
            kind: "rate",
            kp: 0.1,
            ki: 0.05,
            kd: 0.0,
            i_limit: 0.3,
            d_cut_hz: 60,
          };
    } else {
      nextAxis = isCascade(vAxis)
        ? vAxis
        : {
            kind: "cascade",
            angle: { kp: 2.0, ki: 0.0 },
            rate: { kp: 0.12, ki: 0.05, kd: 0.003, i_limit: 0.3, d_cut_hz: 60 },
          };
    }
    onChange({ ...value, [axis]: nextAxis });
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-medium text-gray-100">{title}</h4>
        <div className="flex gap-2 shrink-0">
          <ModeBtn
            label="Simple"
            active={isSimple(vAxis)}
            onClick={() => setMode("simple")}
          />
          <ModeBtn
            label="Cascada"
            active={isCascade(vAxis)}
            onClick={() => setMode("cascade")}
          />
          {allowRateOnly && (
            <ModeBtn
              label="Rate"
              active={isRate(vAxis)}
              onClick={() => setMode("rate")}
            />
          )}
        </div>
      </div>

      {isSimple(vAxis) && (
        <SimpleEditor
          v={vAxis}
          on={(nx) => onChange({ ...value, [axis]: nx })}
        />
      )}
      {isCascade(vAxis) && (
        <CascadeEditor
          v={vAxis}
          on={(nx) => onChange({ ...value, [axis]: nx })}
        />
      )}
      {isRate(vAxis) && (
        <RateEditor v={vAxis} on={(nx) => onChange({ ...value, [axis]: nx })} />
      )}
    </div>
  );
}

/* ---- Panel principal (sin presets) ---- */
export default function PIDPanel({
  value,
  onChange,
}: {
  value: PIDGains;
  onChange: (next: PIDGains) => void;
}) {
  const toggleAlt = (enabled: boolean) => {
    onChange({
      ...value,
      altitude: enabled
        ? value.altitude ?? {
            enabled: true,
            pos: { kp: 1.0, ki: 0.01 },
            vel: { kp: 0.2, ki: 0.1, kd: 0.01, i_limit: 0.4, d_cut_hz: 30 },
          }
        : {
            ...(value.altitude ?? {
              pos: { kp: 0, ki: 0 },
              vel: { kp: 0, ki: 0, kd: 0 },
            }),
            enabled: false,
          },
    });
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-4">
      {/* Ejes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AxisCard title="Roll" axis="roll" value={value} onChange={onChange} />
        <AxisCard
          title="Pitch"
          axis="pitch"
          value={value}
          onChange={onChange}
        />
        <AxisCard
          title="Yaw"
          axis="yaw"
          value={value}
          onChange={onChange}
          allowRateOnly
        />
      </div>

      {/* Altitud opcional */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="font-medium text-gray-100">Altitud (Pos → Vel)</h4>
          <label className="inline-flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-500"
              checked={!!value.altitude?.enabled}
              onChange={(e) => toggleAlt(e.target.checked)}
            />
            Activar
          </label>
        </div>

        {value.altitude?.enabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border border-gray-800 bg-gray-900 p-3">
              <h5 className="mb-3 font-medium">Posición Z (lazo externo)</h5>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Kp">
                  <Num
                    value={value.altitude.pos.kp}
                    onChange={(x) =>
                      onChange({
                        ...value,
                        altitude: {
                          ...value.altitude!,
                          pos: { ...value.altitude!.pos, kp: x },
                        },
                      })
                    }
                    step={0.01}
                  />
                </Field>
                <Field label="Ki">
                  <Num
                    value={value.altitude.pos.ki}
                    onChange={(x) =>
                      onChange({
                        ...value,
                        altitude: {
                          ...value.altitude!,
                          pos: { ...value.altitude!.pos, ki: x },
                        },
                      })
                    }
                    step={0.001}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-md border border-gray-800 bg-gray-900 p-3">
              <h5 className="mb-3 font-medium">Velocidad Z (lazo interno)</h5>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Kp">
                  <Num
                    value={value.altitude.vel.kp}
                    onChange={(x) =>
                      onChange({
                        ...value,
                        altitude: {
                          ...value.altitude!,
                          vel: { ...value.altitude!.vel, kp: x },
                        },
                      })
                    }
                    step={0.01}
                  />
                </Field>
                <Field label="Ki">
                  <Num
                    value={value.altitude.vel.ki}
                    onChange={(x) =>
                      onChange({
                        ...value,
                        altitude: {
                          ...value.altitude!,
                          vel: { ...value.altitude!.vel, ki: x },
                        },
                      })
                    }
                    step={0.001}
                  />
                </Field>
                <Field label="Kd">
                  <Num
                    value={value.altitude.vel.kd}
                    onChange={(x) =>
                      onChange({
                        ...value,
                        altitude: {
                          ...value.altitude!,
                          vel: { ...value.altitude!.vel, kd: x },
                        },
                      })
                    }
                    step={0.001}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="i_limit">
                  <Num
                    value={value.altitude.vel.i_limit ?? 0.4}
                    onChange={(x) =>
                      onChange({
                        ...value,
                        altitude: {
                          ...value.altitude!,
                          vel: { ...value.altitude!.vel, i_limit: x },
                        },
                      })
                    }
                    step={0.01}
                  />
                </Field>
                <Field label="d_cut_hz">
                  <Num
                    value={value.altitude.vel.d_cut_hz ?? 30}
                    onChange={(x) =>
                      onChange({
                        ...value,
                        altitude: {
                          ...value.altitude!,
                          vel: { ...value.altitude!.vel, d_cut_hz: x },
                        },
                      })
                    }
                    step={1}
                  />
                </Field>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- UI helpers ---- */
function ModeBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs border transition whitespace-nowrap ${
        active
          ? "border-blue-500 bg-blue-600 text-white"
          : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-xs text-gray-300">{label}</label>
      <div className="flex">{children}</div>
    </div>
  );
}

function Num({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step ?? 0.01}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) =>
        onChange(
          Number.isFinite(parseFloat(e.target.value))
            ? parseFloat(e.target.value)
            : 0
        )
      }
      className="w-full max-w-[8rem] rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-green-500"
    />
  );
}
