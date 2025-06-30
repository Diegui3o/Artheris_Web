import { motion } from "framer-motion";
import Particles from "react-tsparticles";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-900 to-purple-900 text-white">
      {/* Fondo de Partículas */}
      <Particles
        options={{
          particles: {
            number: {
              value: 80,
            },
            color: {
              value: "#ffffff",
            },
            opacity: {
              value: 0.5,
            },
            size: {
              value: 3,
            },
            move: {
              enable: true,
              speed: 2,
            },
          },
        }}
      />

      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center h-screen text-center relative z-10">
        <motion.h1
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-5xl md:text-7xl font-bold"
        >
          Controla tu Dron como un{" "}
          <span className="text-blue-300">Profesional</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-6 text-xl text-gray-300"
        >
          Supervisa, gestiona y optimiza el rendimiento de tu dron en tiempo
          real.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="mt-8 bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg text-lg"
        >
          Comenzar Ahora
        </motion.button>
      </div>

      {/* Sección de Características */}
      <div className="py-16 px-6 bg-white/10 relative z-10">
        <h2 className="text-4xl font-bold text-center mb-12">
          ¿Por qué elegirnos?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <h3 className="text-2xl font-semibold">Control en Tiempo Real</h3>
            <p className="mt-4 text-gray-300">
              Monitorea la altitud, velocidad y batería de tu dron en tiempo
              real.
            </p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <h3 className="text-2xl font-semibold">Interfaz Intuitiva</h3>
            <p className="mt-4 text-gray-300">
              Diseñada para ser fácil de usar, incluso para principiantes.
            </p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <h3 className="text-2xl font-semibold">Seguridad Garantizada</h3>
            <p className="mt-4 text-gray-300">
              Sistemas avanzados para evitar colisiones y garantizar un vuelo
              seguro.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Sección de Testimonios */}
      <div className="py-16 px-6 relative z-10">
        <h2 className="text-4xl font-bold text-center mb-12">
          Lo que dicen nuestros usuarios
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <p className="text-gray-300 italic">
              "Increíble plataforma. Me ha permitido controlar mi dron de manera
              profesional sin complicaciones."
            </p>
            <p className="mt-4 font-semibold">- Juan Pérez</p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/5 p-6 rounded-lg shadow-lg"
          >
            <p className="text-gray-300 italic">
              "La interfaz es muy intuitiva y las funciones son impresionantes.
              ¡Totalmente recomendado!"
            </p>
            <p className="mt-4 font-semibold">- María Gómez</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
