// Tipos globales para el proyecto

export interface DatosSensor {
  time: string;
  roll?: number;
  pitch?: number;
  yaw?: number;
  Altura?: number;
  modo?: string;
  [key: string]: number | string | undefined;
}

export interface Vuelo {
  fecha: string;
  duracion: string; // formato "mm:ss" o "hh:mm:ss"
  distancia: string; // formato "x.x km" o "xxx m"
  calificacion: number;
}

export interface DeviceProfile {
  registrado: boolean;
  id: string;              // ID único del ESP32
  nombre: string;          // Nombre personalizado
  skin: string;            // Skin seleccionado
  conectado: boolean;      // Estado de conexión
  ultimaConexion: string;  // ISO date de última telemetría
  descripcion?: string;    // Descripción personalizable
  propietario?: string;    // Dueño del dispositivo
  avatarColor?: string;    // Color de avatar personalizado
  notasPrivadas?: string;  // Notas privadas del usuario
  firmware?: string;       // Versión de firmware
}

