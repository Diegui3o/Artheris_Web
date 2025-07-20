import AnglesDisplay from "./AnglesDisplay";
import SensorChart from "./SensorData";

export default function Graphics() {
  return (
    <div className="p-6 text-white bg-gray-900 min-h-screen">
      {/* Main title */}
      <h1 className="text-3xl font-extrabold mb-3 tracking-tight text-blue-370">
        📊 Telemetry graphics
      </h1>

      {/* INTRODUCTORY DESCRIPTION */}
      <p className="mb-8 text-gray-300 text-lg leading-relaxed">
        Real -time monitoring{" "}
        <span className="text-blue-300 font-medium">height</span>,{" "}
        <span className="text-blue-300 font-medium">speed</span> y{" "}
        <span className="text-blue-300 font-medium">orientation</span> of
        precision drone.
      </p>

      {/* Main container with Flexbox */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Visualization of angles */}
        <div className="bg-gray-800 p-5 rounded-2xl shadow-lg w-full lg:w-1/3">
          <h2 className="text-2xl font-bold mb-4 text-teal-400">
            📐 Visualization of angles
          </h2>
          <AnglesDisplay />
        </div>

        {/* Graphic container in a column */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Roll graph */}
          <div className="bg-gray-800 p-5 rounded-2xl shadow-lg h-[500px] overflow-hidden">
            <h3 className="text-xl font-semibold mb-3 text-purple-400">
              🔁 Data graphic comparison
            </h3>
            <SensorChart />
          </div>

          {/* Pitch graph */}
          <div className="bg-gray-800 p-5 rounded-2xl shadow-lg h-[500px] overflow-hidden">
            <h3 className="text-xl font-semibold mb-3 text-purple-400">
              🎯 Data graphic comparison
            </h3>
            <SensorChart />
          </div>

          {/* Motor Inputs Graph */}
          <div className="bg-gray-800 p-5 rounded-2xl shadow-lg h-[500px] overflow-hidden">
            <h3 className="text-xl font-semibold mb-3 text-purple-400">
              ⚙️ Data graphic comparison
            </h3>
            <SensorChart />
          </div>
        </div>
      </div>
    </div>
  );
}
