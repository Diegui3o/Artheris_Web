import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import SwitchControl from "./SwitchOp";

type RecordingStatus = {
  active: boolean;
  remainingMs?: number;
  durationMs?: number;
  flightId?: string | null;
};

export default function Settings() {
  // Flight params
  const [mass, setMass] = useState(1.1);
  const [armLength, setArmLength] = useState(0.223);

  // LQR matrices
  const [kc, setKc] = useState<{ [key: string]: number }>({
    "Kc_at[0][0]": 2.1,
    "Kc_at[1][1]": 1.92,
    "Kc_at[2][2]": 5.3,
    "Kc_at[0][3]": 0.58,
    "Kc_at[1][4]": 0.38,
    "Kc_at[2][5]": 1.6,
  });
  const [ki, setKi] = useState<{ [key: string]: number }>({
    "Ki_at[0][0]": 0.04,
    "Ki_at[1][1]": 0.09,
    "Ki_at[2][2]": 0.01,
  });

  // Recording UI state
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(30); // seconds
  const [indefiniteRecording, setIndefiniteRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({
    active: false,
  });

  const [lastFlightId, setLastFlightId] = useState<string | null>(null);

  // ===== Helpers =====
  const formatTime = (ms?: number) => {
    if (ms === undefined || ms === null) return "—";
    const total = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${pad(mm)}:${pad(ss)}`;
  };

  // Construye mapa editable para Ki (3x3, diagonal)
  const buildKiEditableMap = (kiObj: Record<string, number>) => {
    const map: Record<string, { key: string; value: number }> = {};
    const diagKeys = ["Ki_at[0][0]", "Ki_at[1][1]", "Ki_at[2][2]"];
    diagKeys.forEach((key) => {
      const m = key.match(/\[(\d+)\]\[(\d+)\]/);
      if (!m) return;
      const r = parseInt(m[1]);
      const c = parseInt(m[2]);
      map[`${r},${c}`] = { key, value: kiObj[key] ?? 0 };
    });
    return map;
  };

  // Construye mapa editable para Kc (3x6)
  const buildKcEditableMap = (kcObj: Record<string, number>) => {
    const map: Record<string, { key: string; value: number }> = {};
    const keys = [
      "Kc_at[0][0]",
      "Kc_at[1][1]",
      "Kc_at[2][2]",
      "Kc_at[0][3]",
      "Kc_at[1][4]",
      "Kc_at[2][5]",
    ];
    keys.forEach((key) => {
      const m = key.match(/\[(\d+)\]\[(\d+)\]/);
      if (!m) return;
      const r = parseInt(m[1]);
      const c = parseInt(m[2]);
      map[`${r},${c}`] = { key, value: kcObj[key] ?? 0 };
    });
    return map;
  };

  // Handlers de cambio para celdas
  const onKiCellChange = (key: string, value: number) => {
    setKi((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
  };

  const onKcCellChange = (key: string, value: number) => {
    setKc((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
  };

  const statusLabel = useMemo(() => {
    if (recordingStatus.active) return "Recording";
    return "Idle";
  }, [recordingStatus.active]);

  // ===== Effects =====
  useEffect(() => {
    const cached = localStorage.getItem("lastFlightId");
    if (cached) setLastFlightId(cached);
  }, []);

  // Polling for recording status
  useEffect(() => {
    let isMounted = true;

    const checkStatus = async () => {
      if (!isMounted) return;

      try {
        const response = await fetch(
          "http://localhost:3002/recording/recording-status"
        );
        if (!response.ok) return;

        const raw = await response.json();

        // --- Normalización de backend mixto ---
        const active = Boolean(raw.active ?? raw.isRecording ?? false);

        // durationMs puede venir como number, string "12345ms" o en otra clave
        let durationMs: number | undefined;
        if (typeof raw.durationMs === "number") {
          durationMs = raw.durationMs;
        } else if (typeof raw.recordingDuration === "number") {
          durationMs = raw.recordingDuration;
        } else if (
          typeof raw.recordingDuration === "string" &&
          raw.recordingDuration.endsWith("ms")
        ) {
          const parsed = Number(raw.recordingDuration.replace("ms", ""));
          durationMs = Number.isFinite(parsed) ? parsed : undefined;
        }

        const remainingMs =
          typeof raw.remainingMs === "number" ? raw.remainingMs : undefined;
        const flightId = raw.flightId ?? raw.currentFlightId ?? null;

        if (!isMounted) return;

        setRecordingStatus((prev) => {
          if (
            prev.active === active &&
            prev.flightId === flightId &&
            prev.remainingMs === remainingMs
          ) {
            return prev;
          }
          return {
            ...prev,
            active,
            flightId: flightId ?? prev.flightId,
            durationMs: durationMs ?? prev.durationMs,
            remainingMs: remainingMs ?? prev.remainingMs,
          };
        });

        setRecording(active);

        // Actualiza lastFlightId solo si cambió y es válido
        if (flightId && flightId !== lastFlightId) {
          localStorage.setItem("lastFlightId", flightId);
          setLastFlightId(flightId);
        }
      } catch (error) {
        console.error("Error checking recording status:", error);
      }
    };

    // Chequeo inicial + intervalo
    checkStatus();
    const intervalId = setInterval(checkStatus, 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []); // <-- ¡sin deps!

  const handleStartRecording = async () => {
    try {
      const durationMs = indefiniteRecording
        ? undefined
        : recordingDuration * 1000;
      const response = await fetch(
        "http://localhost:3002/recording/start-recording",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            durationMs,
            Kc: kc,
            Ki: ki,
            mass,
            armLength,
            autoMetrics: false,
          }),
        }
      );

      if (!response.ok) {
        console.error("Start recording failed:", await response.text());
        return;
      }

      const result = await response.json();

      // --- Normaliza claves ---
      const flightId = result.flightId ?? null;

      let dMs: number | undefined;
      if (typeof result.durationMs === "number") {
        dMs = result.durationMs;
      } else if (typeof result.recordingDuration === "number") {
        dMs = result.recordingDuration;
      } else if (
        typeof result.recordingDuration === "string" &&
        result.recordingDuration.endsWith("ms")
      ) {
        const parsed = Number(result.recordingDuration.replace("ms", ""));
        dMs = Number.isFinite(parsed) ? parsed : undefined;
      } else if (indefiniteRecording) {
        dMs = undefined; // grabación indefinida
      }

      // Optimista: botón cambia a "Detener" de inmediato
      setRecording(true);
      setRecordingStatus({
        active: true,
        remainingMs: dMs,
        durationMs: dMs,
        flightId,
      });

      if (flightId) {
        localStorage.setItem("lastFlightId", flightId);
        setLastFlightId(flightId);
      }
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const handleStopRecording = async () => {
    try {
      setRecording(false); // Optimistically update UI

      const response = await fetch(
        "http://localhost:3002/recording/stop-recording",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log("Stop recording response:", result);

        // Update recording status with the stopped state
        setRecordingStatus({
          active: false,
          flightId: result?.flightId || lastFlightId,
          remainingMs: 0,
          durationMs: 0,
        });

        // Update last flight ID if we got a valid flight ID
        if (result?.flightId) {
          localStorage.setItem("lastFlightId", result.flightId);
          setLastFlightId(result.flightId);

          // Force a refresh of the flights list in other components
          const event = new CustomEvent("recordingStopped", {
            detail: { flightId: result.flightId },
          });
          window.dispatchEvent(event);
        }
      } else {
        const errorText = await response.text();
        console.error("Stop recording failed:", errorText);
        // Revert the UI if the request failed
        setRecording(true);
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      // Revert the UI on error
      setRecording(true);
    }
  };

  const handleRecordingToggle = () => {
    if (recording) return handleStopRecording();
    return handleStartRecording();
  };

  // ===== UI =====
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar sticky: estado + acciones principales */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Artheris Flight — Panel</h1>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                recordingStatus.active
                  ? "bg-green-900/40 text-green-300 border border-green-700/50"
                  : "bg-gray-800 text-gray-300 border border-gray-700"
              }`}
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  recordingStatus.active
                    ? "bg-green-400 animate-pulse"
                    : "bg-gray-400"
                }`}
              />
              {statusLabel}
            </span>
            {recordingStatus.active && !indefiniteRecording && (
              <span className="text-sm text-gray-300">
                {formatTime(recordingStatus.remainingMs)} /{" "}
                {formatTime(recordingStatus.durationMs)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={lastFlightId ? "/metrics/last" : "#"}
              onClick={(e) => !lastFlightId && e.preventDefault()}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow transition ${
                lastFlightId
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-700 text-gray-300 cursor-not-allowed"
              }`}
              title={
                lastFlightId
                  ? "Ver métricas del último vuelo"
                  : "Graba un vuelo para habilitar"
              }
            >
              📊 Métricas último vuelo
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Panel superior: controles de grabación compactos */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="mb-3 text-lg font-semibold">
              Controles de grabación
            </h2>

            <div className="flex flex-col gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={indefiniteRecording}
                  onChange={(e) => setIndefiniteRecording(e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                <span className="text-sm text-gray-300">
                  Grabación indefinida
                </span>
              </label>

              {/* Duración solo si no es indefinido */}
              {!indefiniteRecording && (
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-300 w-48">
                    Duración (segundos)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={3600}
                    value={recordingDuration}
                    onChange={(e) =>
                      setRecordingDuration(Number(e.target.value))
                    }
                    className="w-32 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleRecordingToggle}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow transition ${
                    recording
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-white" />
                  {recording ? "Detener" : "Iniciar grabación"}
                </button>

                <div className="text-sm text-gray-400">
                  {recordingStatus.active ? (
                    indefiniteRecording ? (
                      <span>Grabando (indefinido)</span>
                    ) : (
                      <span>
                        Restante: {formatTime(recordingStatus.remainingMs)} /{" "}
                        {formatTime(recordingStatus.durationMs)}
                      </span>
                    )
                  ) : (
                    <span>Listo para grabar</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          {recordingStatus.active &&
            !indefiniteRecording &&
            Number.isFinite(recordingStatus.durationMs) && (
              <span className="text-sm text-gray-300">
                {formatTime(recordingStatus.remainingMs)} /{" "}
                {formatTime(recordingStatus.durationMs)}
              </span>
            )}
          {/* Modo (SwitchControl) */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="mb-3 text-lg font-semibold">Modo</h2>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <SwitchControl />
            </div>
          </div>
        </section>

        {/* Parámetros y LQR */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Parámetros de vuelo */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="mb-3 text-lg font-semibold">
              ✈️ Parámetros de vuelo
            </h2>
            <div className="space-y-4">
              <Field
                label="Mass (kg)"
                value={mass}
                onChange={(v) => setMass(v)}
              />
              <Field
                label="Arm length (m)"
                value={armLength}
                onChange={(v) => setArmLength(v)}
                disabled={recording}
              />
            </div>
          </div>

          {/* LQR Matrices */}
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">
              🧮 Matrices de Control LQR
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <MatrixEditor
                title="Matriz Ki (3×3)"
                rows={3}
                cols={3}
                editableMap={buildKiEditableMap(ki)}
                onChange={onKiCellChange}
                rowLabels={["Fila 0", "Fila 1", "Fila 2"]}
                colLabels={["Col 0", "Col 1", "Col 2"]}
              />
              <MatrixEditor
                title="Matriz Kc (3×6)"
                rows={3}
                cols={6}
                editableMap={buildKcEditableMap(kc)}
                onChange={onKcCellChange}
                rowLabels={["Fila 0", "Fila 1", "Fila 2"]}
                colLabels={Array(6)
                  .fill(0)
                  .map((_, i) => `Col ${i}`)}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------- Subcomponentes UI ---------- */

interface MatrixEditorProps {
  title: string;
  rows: number;
  cols: number;
  editableMap: Record<string, { key: string; value: number }>;
  onChange: (key: string, value: number) => void;
  rowLabels?: string[];
  colLabels?: string[];
}

const MatrixEditor: React.FC<MatrixEditorProps> = ({
  title,
  rows,
  cols,
  editableMap,
  onChange,
  rowLabels,
  colLabels,
}) => {
  // para navegar con flechas entre inputs
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

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-48 text-sm text-gray-300">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-40 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
      />
    </div>
  );
}
