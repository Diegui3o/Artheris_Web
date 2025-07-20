import LedControl from "./LedOption";
import MotorsControl from "./MotorsOption";
import SwitchControl from "./SwitchOp";

const Calibration: React.FC = () => {
  return (
    <div className="bg-gray-900 p-6 rounded-2xl shadow-xl max-w-5xl mx-auto my-2 border border-gray-700 flex flex-col items-center">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-white mb-2 text-center uppercase tracking-wide">
        Drone calibration
      </h1>
      <div className="w-32 h-1 bg-blue-500 rounded-full mb-4"></div>

      {/* subtitle */}
      <p className="text-gray-400 text-sm mb-4 text-center max-w-md">
        Adjust and prove the different modules of the drone before its
        deployment.
      </p>

      {/* Control container */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {/* LED control section */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-md border border-gray-700 flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-3 uppercase tracking-wide">
            Panel LED control
          </h2>
          <LedControl />
          <LedControl />
        </div>

        {/* Motor control section */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-md border border-gray-700 flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-3 uppercase tracking-wide">
            Panel Motor control
          </h2>
          <MotorsControl />
          <MotorsControl />
        </div>

        {/* Switching mode */}
        <div className="bg-gray-800 p-4 rounded-2xl shadow-md border border-gray-700 flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-3 uppercase tracking-wide">
            Panel Switching mode
          </h2>
          <SwitchControl />
        </div>
      </div>
    </div>
  );
};

export default Calibration;
