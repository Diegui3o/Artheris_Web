import React from "react";

interface MatrixEditorProps {
  title: string;
  rows: number;
  cols: number;
  editableMap: Record<string, { key: string; value: number }>;
  onChange: (key: string, value: number) => void;
  rowLabels?: string[];
  colLabels?: string[];
}

export const MatrixEditor: React.FC<MatrixEditorProps> = ({
  title,
  rows,
  cols,
  editableMap,
  onChange,
  rowLabels,
  colLabels,
}) => {
  const handleKeyNav = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget as HTMLInputElement;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    const seek = (nr: number, nc: number) => {
      const next = document.querySelector<HTMLInputElement>(
        `input[data-rc="${nr},${nc}"]`
      );
      if (next) next.focus();
    };
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        for (let nr = r - 1; nr >= 0; nr--)
          if (document.querySelector(`input[data-rc="${nr},${c}"]`)) {
            seek(nr, c);
            break;
          }
        break;
      case "ArrowDown":
        e.preventDefault();
        for (let nr = r + 1; nr < rows; nr++)
          if (document.querySelector(`input[data-rc="${nr},${c}"]`)) {
            seek(nr, c);
            break;
          }
        break;
      case "ArrowLeft":
        e.preventDefault();
        for (let nc = c - 1; nc >= 0; nc--)
          if (document.querySelector(`input[data-rc="${r},${nc}"]`)) {
            seek(r, nc);
            break;
          }
        break;
      case "ArrowRight":
        e.preventDefault();
        for (let nc = c + 1; nc < cols; nc++)
          if (document.querySelector(`input[data-rc="${r},${nc}"]`)) {
            seek(r, nc);
            break;
          }
        break;
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-md font-medium">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-14"></th>
              {Array.from({ length: cols }).map((_, c) => (
                <th
                  key={c}
                  className="px-2 py-1 text-xs font-semibold text-gray-300 text-center"
                >
                  {colLabels?.[c] ?? `c${c}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                <td className="pr-2 text-xs font-semibold text-gray-300 text-right w-14">
                  {rowLabels?.[r] ?? `r${r}`}
                </td>
                {Array.from({ length: cols }).map((__, c) => {
                  const rc = `${r},${c}`;
                  const entry = editableMap[rc];
                  const isEditable = !!entry;
                  return (
                    <td key={c} className="p-1">
                      {isEditable ? (
                        <input
                          type="number"
                          step="0.01"
                          title={entry.key}
                          defaultValue={
                            Number.isFinite(entry.value) ? entry.value : 0
                          }
                          data-r={r}
                          data-c={c}
                          data-rc={rc}
                          onKeyDown={handleKeyNav}
                          onChange={(e) =>
                            onChange(entry.key, parseFloat(e.target.value))
                          }
                          className="w-20 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-green-500 text-center"
                        />
                      ) : (
                        <div className="w-20 rounded-md border border-dashed border-gray-800 bg-gray-900/60 px-2 py-1 text-center text-gray-600 text-sm select-none">
                          —
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[11px] text-gray-400">
        <span className="inline-block rounded border border-gray-700 bg-gray-800 px-2 py-[2px] mr-2">
          Editable
        </span>
        <span className="inline-block rounded border border-dashed border-gray-800 bg-gray-900/60 px-2 py-[2px]">
          No usado
        </span>
      </div>
    </div>
  );
};
