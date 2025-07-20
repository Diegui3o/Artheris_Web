import { motion } from "framer-motion";
import Particles from "react-tsparticles";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-900 to-purple-900 text-white">
      {/* Particle background */}
      <Particles
        options={{
          particles: {
            number: { value: 80 },
            color: { value: "#ffffff" },
            opacity: { value: 0.5 },
            size: { value: 3 },
            move: { enable: true, speed: 2 },
          },
        }}
      />

      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center h-screen text-center relative z-10 px-6">
        <motion.h1
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-5xl md:text-7xl font-bold max-w-4xl"
        >
          Artheris FlightControl
          <br />
          Professional-Grade Drone Control.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-6 text-xl text-gray-300 max-w-3xl"
        >
          Take full command of your drone with real-time monitoring, intuitive
          controls, and advanced analytics all designed to optimize your flight
          experience effortlessly.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="mt-8 bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg text-lg shadow-lg"
        >
          Discover More
        </motion.button>
      </div>

      {/* Features Section */}
      <div className="py-16 px-6 bg-white/10 relative z-10">
        <h2 className="text-4xl font-bold text-center mb-12">
          Why Choose Our Software?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <h3 className="text-2xl font-semibold">Real-Time Flight Control</h3>
            <p className="mt-4 text-gray-300">
              Monitor altitude, velocity, battery status, and more — all updated
              instantly.
            </p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <h3 className="text-2xl font-semibold">User-Friendly Interface</h3>
            <p className="mt-4 text-gray-300">
              Designed for both beginners and experts to navigate with ease.
            </p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <h3 className="text-2xl font-semibold">Enhanced Safety Features</h3>
            <p className="mt-4 text-gray-300">
              Advanced collision avoidance and secure flight protocols for peace
              of mind.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Testimonials Section */}
      <div className="py-16 px-6 relative z-10">
        <h2 className="text-4xl font-bold text-center mb-12">
          Meet the Creators
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <p className="text-gray-300 italic">
              "This drone control platform is designed to deliver precise,
              reliable performance by integrating advanced drone dynamics and
              control theory, ensuring an intuitive and efficient user
              experience."
            </p>
            <p className="mt-4 font-semibold">- Diego M.</p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <p className="text-gray-300 italic">
              "Driven by passion and innovation, we crafted this software to
              empower drone pilots of all levels to fly with confidence and
              control."
            </p>
            <p className="mt-4 font-semibold">- Raphael R.</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
