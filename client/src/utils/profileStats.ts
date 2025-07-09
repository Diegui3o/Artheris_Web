import { DatosSensor, Vuelo } from "../types";

export function parseDuracion(duracion: string): number {
  const partes = duracion.split(":").map(Number);
  if (partes.length === 2) return partes[0] * 60 + partes[1];
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  return 0;
}

export function parseDistancia(distancia: string): number {
  if (distancia.includes("km")) return parseFloat(distancia) * 1000;
  if (distancia.includes("m")) return parseFloat(distancia);
  return 0;
}

export function calcularEstadisticas(historial: Vuelo[], telemetria: DatosSensor[]): {
  alturaPromedio: number;
  distanciaTotal: number;
  tiempoTotal: number;
  calificacionPromedio: number;
} {
  const alturas = telemetria.map(d => Number(d.Altura) || 0).filter(x => x > 0);
  const alturaPromedio = alturas.length ? alturas.reduce((a, b) => a + b, 0) / alturas.length : 0;
  const distanciaTotal = historial.reduce((acc, v) => acc + parseDistancia(v.distancia), 0);
  const tiempoTotal = historial.reduce((acc, v) => acc + parseDuracion(v.duracion), 0);
  const calificacionPromedio = historial.length ? historial.reduce((acc, v) => acc + v.calificacion, 0) / historial.length : 0;
  return { alturaPromedio, distanciaTotal, tiempoTotal, calificacionPromedio };
}
