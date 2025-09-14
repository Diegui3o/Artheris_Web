import type { ControllerType } from "../../types/controller";

export default function ControllerSelector({
  value,
  onChange,
}: {
  value: ControllerType;
  onChange: (t: ControllerType) => void;
}) {
  const items: { key: ControllerType; label: string; desc: string }[] = [
    { key: "pid", label: "PID", desc: "Kp / Ki / Kd por eje" },
    { key: "lqr", label: "LQR", desc: "Kc y Ki (matrices)" },
    { key: "custom", label: "Custom", desc: "Otro (MPC, SAC, etc.)" },
  ];

  return (
    <div className="flex gap-2">
      {items.map((it) => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              active
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
            }`}
            title={it.desc}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
