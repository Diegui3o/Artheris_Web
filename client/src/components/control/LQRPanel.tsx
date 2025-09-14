import { useMemo } from "react";
import { MatrixEditor } from "../ui/MatrixEditor";
import type { LQRParams } from "../../types/controller";

export default function LQRPanel({
  value,
  onChange,
}: {
  value: LQRParams;
  onChange: (next: LQRParams) => void;
}) {
  const buildKiEditableMap = (kiObj: Record<string, number>) => {
    const map: Record<string, { key: string; value: number }> = {};
    const diagKeys = ["Ki_at[0][0]", "Ki_at[1][1]", "Ki_at[2][2]"];
    diagKeys.forEach((key) => {
      const m = key.match(/\[(\d+)\]\[(\d+)\]/);
      if (!m) return;
      map[`${m[1]},${m[2]}`] = { key, value: kiObj[key] ?? 0 };
    });
    return map;
  };

  const buildKcEditableMap = (kcObj: Record<string, number>) => {
    const keys = [
      "Kc_at[0][0]",
      "Kc_at[1][1]",
      "Kc_at[2][2]",
      "Kc_at[0][3]",
      "Kc_at[1][4]",
      "Kc_at[2][5]",
    ];
    const map: Record<string, { key: string; value: number }> = {};
    keys.forEach((key) => {
      const m = key.match(/\[(\d+)\]\[(\d+)\]/);
      if (!m) return;
      map[`${m[1]},${m[2]}`] = { key, value: kcObj[key] ?? 0 };
    });
    return map;
  };

  const kiMap = useMemo(() => buildKiEditableMap(value.Ki), [value.Ki]);
  const kcMap = useMemo(() => buildKcEditableMap(value.Kc), [value.Kc]);

  return (
    <div className="grid grid-cols-1 gap-4">
      <MatrixEditor
        title="Matriz Ki (3×3)"
        rows={3}
        cols={3}
        editableMap={kiMap}
        onChange={(key, v) =>
          onChange({
            ...value,
            Ki: { ...value.Ki, [key]: Number.isFinite(v) ? v : 0 },
          })
        }
        rowLabels={["Fila 0", "Fila 1", "Fila 2"]}
        colLabels={["Col 0", "Col 1", "Col 2"]}
      />
      <MatrixEditor
        title="Matriz Kc (3×6)"
        rows={3}
        cols={6}
        editableMap={kcMap}
        onChange={(key, v) =>
          onChange({
            ...value,
            Kc: { ...value.Kc, [key]: Number.isFinite(v) ? v : 0 },
          })
        }
        rowLabels={["Fila 0", "Fila 1", "Fila 2"]}
        colLabels={Array.from({ length: 6 }, (_, i) => `Col ${i}`)}
      />
    </div>
  );
}
