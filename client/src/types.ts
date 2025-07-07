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
