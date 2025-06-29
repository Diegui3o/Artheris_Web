import LedControl from "./LedOption";
import MotorsControl from "./MotorsOption";
import SwitchControl from "./SwitchMode";

const Calibration: React.FC = () => {
  return (
    <div className="bg-gray-900 p-6 rounded-2xl shadow-xl max-w-5xl mx-auto my-2 border border-gray-700 flex flex-col items-center">
      {/* Título de la página */}
      <h1 className="text-2xl font-bold text-white mb-2 text-center uppercase tracking-wide">
        Calibración del Dron
      </h1>

      {/* Línea decorativa */}
      <div className="w-32 h-1 bg-blue-500 rounded-full mb-4"></div>

      {/* Subtítulo */}
      <p className="text-gray-400 text-sm mb-4 text-center max-w-md">
        Ajusta y prueba los diferentes módulos del dron antes de su despliegue.
      </p>

      {/* Contenedor de los controles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {/* Sección de Control de LEDs */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-md border border-gray-700 flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-3 uppercase tracking-wide">
            Control de LEDs
          </h2>
          <LedControl />
          <LedControl />
        </div>

        {/* Sección de Control de Motores */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-md border border-gray-700 flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-3 uppercase tracking-wide">
            Control de Motores
          </h2>
          <MotorsControl />
          <MotorsControl />
        </div>

        {/* Sección de Modo de Conmutación */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-md border border-gray-700 flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-3 uppercase tracking-wide">
            Modo de Conmutación
          </h2>
          <SwitchControl />
        </div>
      </div>
    </div>
  );
};

export default Calibration;
