import AnglesDisplay from "./AnglesDisplay";
import SensorChart from "./SensorData";

export default function Graphics() {
  return (
    <div className="p-6 text-white bg-gray-900 min-h-screen">
      {/* Título principal */}
      <h1 className="text-3xl font-extrabold mb-3 tracking-tight text-blue-370">
        📊 Gráficos de Telemetría
      </h1>

      {/* Descripción introductoria */}
      <p className="mb-8 text-gray-300 text-lg leading-relaxed">
        Monitoriza en tiempo real{" "}
        <span className="text-blue-300 font-medium">altura</span>,{" "}
        <span className="text-blue-300 font-medium">velocidad</span> y{" "}
        <span className="text-blue-300 font-medium">orientación</span> del dron
        con precisión.
      </p>

      {/* Contenedor principal con flexbox */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Visualización de Ángulos */}
        <div className="bg-gray-800 p-5 rounded-2xl shadow-lg w-full lg:w-1/3">
          <h2 className="text-2xl font-bold mb-4 text-teal-400">
            📐 Visualización de Ángulos
          </h2>
          <AnglesDisplay />
        </div>

        {/* Contenedor de gráficas en una columna */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Gráfica de Roll */}
          <div className="bg-gray-800 p-5 rounded-2xl shadow-lg h-[500px] overflow-hidden">
            <h3 className="text-xl font-semibold mb-3 text-purple-400">
              🔁 Data Comparación
            </h3>
            <SensorChart />
          </div>

          {/* Gráfica de Pitch */}
          <div className="bg-gray-800 p-5 rounded-2xl shadow-lg h-[500px] overflow-hidden">
            <h3 className="text-xl font-semibold mb-3 text-purple-400">
              🎯 Data Comparación
            </h3>
            <SensorChart />
          </div>

          {/* Gráfica de Motor Inputs */}
          <div className="bg-gray-800 p-5 rounded-2xl shadow-lg h-[500px] overflow-hidden">
            <h3 className="text-xl font-semibold mb-3 text-purple-400">
              ⚙️ Data Comparación
            </h3>
            <SensorChart />
          </div>
        </div>
      </div>
    </div>
  );
}
