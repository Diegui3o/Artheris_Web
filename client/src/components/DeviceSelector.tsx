import { DeviceProfile } from "../types";
import { useNavigate } from "react-router-dom";

interface DeviceSelectorProps {
  devices: DeviceProfile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function DeviceSelector({ devices, selectedId, onSelect }: DeviceSelectorProps) {
  const navigate = useNavigate();
  return (
    <div className="w-full max-w-xs bg-white/10 rounded-2xl p-4 mb-6 shadow-lg">
      <h3 className="text-white text-lg font-bold mb-2">Dispositivos conectados</h3>
      <ul className="flex flex-col gap-2">
        {devices.length === 0 && (
          <li className="text-gray-400 italic">No hay dispositivos</li>
        )}
        {devices.map((d) => (
          <li
            key={d.id}
            className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-all ${selectedId === d.id ? "bg-green-800/40" : "hover:bg-white/10"}`}
            onClick={() => onSelect(d.id)}
            onDoubleClick={() => navigate(`/device/${d.id}`)}
            onContextMenu={e => {
              e.preventDefault();
              navigate(`/device/${d.id}`);
            }}
            title="Doble clic o clic derecho para ver perfil completo"
          >
            <span className={`inline-block w-3 h-3 rounded-full ${d.conectado ? "bg-green-400" : "bg-red-400"}`}></span>
            <span className="text-white font-medium">{d.nombre}</span>
            <span className="ml-auto text-xs text-gray-400">{d.conectado ? "Conectado" : "Desconectado"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

