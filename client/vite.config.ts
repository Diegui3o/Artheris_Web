import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true, // Habilita proxy para WebSocket
        changeOrigin: true,
      },
      '/simulate': 'http://localhost:3002', // Proxy para las rutas de simulación
    },
  },
})