// Importar las variables necesarias desde index.js
import { state, dispositivosConectados, esp32Sockets, ultimoContacto } from "../index.js";
import express from "express";

// Inicializar el router de Express
const app = express.Router();

// Cambiar valor de una variable en un ESP32 específico
app.post("/api/variable/:id", (req, res) => {
  const id = req.params.id;
  const { variable, valor } = req.body; // ejemplo: { "variable": "setpoint_altura", "valor": 30 }

  const ws = esp32Sockets[id];
  if (ws && ws.readyState === 1) {
    const command = JSON.stringify({
      type: "command",
      payload: { [variable]: valor },
    });
    ws.send(command);
    console.log(`📤 Enviando actualización a ${id}:`, command);
    res.json({ ok: true, message: `Variable '${variable}' actualizada a ${valor} en ${id}` });
  } else {
    res.status(404).json({ ok: false, message: `ESP32 ${id} no conectado` });
  }
});

// Cambiar múltiples variables en un ESP32 específico
app.post("/api/variables/:id", (req, res) => {
  const id = req.params.id;
  const variables = req.body; // ejemplo: { "setpoint_altura": 30, "velocidad": 50, "modo": 2 }

  if (!variables || Object.keys(variables).length === 0) {
    return res.status(400).json({ ok: false, message: "No se proporcionaron variables para actualizar" });
  }

  const ws = esp32Sockets[id];
  if (ws && ws.readyState === 1) {
    const command = JSON.stringify({
      type: "command",
      payload: variables,
    });
    ws.send(command);
    console.log(`📤 Enviando múltiples actualizaciones a ${id}:`, command);
    res.json({ 
      ok: true, 
      message: `${Object.keys(variables).length} variables actualizadas en ${id}`,
      variables: variables
    });
  } else {
    res.status(404).json({ ok: false, message: `ESP32 ${id} no conectado` });
  }
});

// Cambiar una variable en todos los ESP32 conectados
app.post("/api/variable/all", (req, res) => {
  const { variable, valor } = req.body; // ejemplo: { "variable": "setpoint_altura", "valor": 30 }
  
  if (!variable || valor === undefined) {
    return res.status(400).json({ ok: false, message: "Se requiere variable y valor" });
  }

  const connectedDevices = [];
  let count = 0;

  Object.keys(esp32Sockets).forEach(id => {
    const ws = esp32Sockets[id];
    if (ws && ws.readyState === 1) {
      const command = JSON.stringify({
        type: "command",
        payload: { [variable]: valor },
      });
      ws.send(command);
      console.log(`📤 Enviando actualización a todos - Dispositivo ${id}:`, command);
      connectedDevices.push(id);
      count++;
    }
  });

  if (count > 0) {
    res.json({ 
      ok: true, 
      message: `Variable '${variable}' actualizada a ${valor} en ${count} dispositivos`,
      devices: connectedDevices
    });
  } else {
    res.status(404).json({ ok: false, message: "No hay dispositivos ESP32 conectados" });
  }
});

// Cambiar múltiples variables en todos los ESP32 conectados
app.post("/api/variables/all", (req, res) => {
  const variables = req.body; // ejemplo: { "setpoint_altura": 30, "velocidad": 50, "modo": 2 }
  
  if (!variables || Object.keys(variables).length === 0) {
    return res.status(400).json({ ok: false, message: "No se proporcionaron variables para actualizar" });
  }

  const connectedDevices = [];
  let count = 0;

  Object.keys(esp32Sockets).forEach(id => {
    const ws = esp32Sockets[id];
    if (ws && ws.readyState === 1) {
      const command = JSON.stringify({
        type: "command",
        payload: variables,
      });
      ws.send(command);
      console.log(`📤 Enviando múltiples actualizaciones a todos - Dispositivo ${id}:`, command);
      connectedDevices.push(id);
      count++;
    }
  });

  if (count > 0) {
    res.json({ 
      ok: true, 
      message: `${Object.keys(variables).length} variables actualizadas en ${count} dispositivos`,
      devices: connectedDevices,
      variables: variables
    });
  } else {
    res.status(404).json({ ok: false, message: "No hay dispositivos ESP32 conectados" });
  }
});

// Solicitar el estado actual de las variables de un ESP32 específico
app.post("/api/request-state/:id", (req, res) => {
  const id = req.params.id;
  const variables = req.body?.variables || []; // Lista de variables a solicitar (opcional)
  
  const ws = esp32Sockets[id];
  if (ws && ws.readyState === 1) {
    const command = JSON.stringify({
      type: "request",
      payload: { 
        request_type: "state",
        variables: variables.length > 0 ? variables : "all"
      },
    });
    ws.send(command);
    console.log(`📤 Solicitando estado a ${id}:`, command);
    res.json({ 
      ok: true, 
      message: `Solicitud de estado enviada a ${id}`,
      requested_variables: variables.length > 0 ? variables : "all"
    });
  } else {
    res.status(404).json({ ok: false, message: `ESP32 ${id} no conectado` });
  }
});

// Endpoint para configurar parámetros de control del ESP32
app.post("/api/config/:id", (req, res) => {
  const id = req.params.id;
  const config = req.body; // Parámetros de configuración
  
  if (!config || Object.keys(config).length === 0) {
    return res.status(400).json({ ok: false, message: "No se proporcionaron parámetros de configuración" });
  }

  const ws = esp32Sockets[id];
  if (ws && ws.readyState === 1) {
    const command = JSON.stringify({
      type: "config",
      payload: config,
    });
    ws.send(command);
    console.log(`📤 Enviando configuración a ${id}:`, command);
    res.json({ 
      ok: true, 
      message: `Configuración enviada a ${id}`,
      config: config
    });
  } else {
    res.status(404).json({ ok: false, message: `ESP32 ${id} no conectado` });
  }
});

// Endpoint para enviar comandos de sistema al ESP32 (calibración, reinicio, etc.)
app.post("/api/system/:id/:command", (req, res) => {
  const id = req.params.id;
  const systemCommand = req.params.command;
  const params = req.body || {}; // Parámetros adicionales (opcional)
  
  // Validar comandos permitidos
  const allowedCommands = ["calibrate", "reset", "restart", "update", "diagnostic"];
  if (!allowedCommands.includes(systemCommand)) {
    return res.status(400).json({ 
      ok: false, 
      message: `Comando no válido. Comandos permitidos: ${allowedCommands.join(", ")}` 
    });
  }

  const ws = esp32Sockets[id];
  if (ws && ws.readyState === 1) {
    const command = JSON.stringify({
      type: "system",
      command: systemCommand,
      params: params
    });
    ws.send(command);
    console.log(`📤 Enviando comando de sistema a ${id}:`, command);
    res.json({ 
      ok: true, 
      message: `Comando '${systemCommand}' enviado a ${id}`,
      command: systemCommand,
      params: params
    });
  } else {
    res.status(404).json({ ok: false, message: `ESP32 ${id} no conectado` });
  }
});

// Endpoint para enviar comandos de sistema a todos los ESP32 conectados
app.post("/api/system/all/:command", (req, res) => {
  const systemCommand = req.params.command;
  const params = req.body || {}; // Parámetros adicionales (opcional)
  
  // Validar comandos permitidos
  const allowedCommands = ["calibrate", "reset", "restart", "update", "diagnostic"];
  if (!allowedCommands.includes(systemCommand)) {
    return res.status(400).json({ 
      ok: false, 
      message: `Comando no válido. Comandos permitidos: ${allowedCommands.join(", ")}` 
    });
  }

  const connectedDevices = [];
  let count = 0;

  Object.keys(esp32Sockets).forEach(id => {
    const ws = esp32Sockets[id];
    if (ws && ws.readyState === 1) {
      const command = JSON.stringify({
        type: "system",
        command: systemCommand,
        params: params
      });
      ws.send(command);
      console.log(`📤 Enviando comando de sistema a todos - Dispositivo ${id}:`, command);
      connectedDevices.push(id);
      count++;
    }
  });

  if (count > 0) {
    res.json({ 
      ok: true, 
      message: `Comando '${systemCommand}' enviado a ${count} dispositivos`,
      command: systemCommand,
      params: params,
      devices: connectedDevices
    });
  } else {
    res.status(404).json({ ok: false, message: "No hay dispositivos ESP32 conectados" });
  }
});

// Obtener información detallada de un ESP32 específico
app.get("/api/device/:id/info", (req, res) => {
  const id = req.params.id;
  
  if (!dispositivosConectados[id] && !esp32Sockets[id]) {
    return res.status(404).json({ ok: false, message: `ESP32 ${id} no encontrado` });
  }
  
  const deviceInfo = {
    id: id,
    connected: !!(esp32Sockets[id] && esp32Sockets[id].readyState === 1),
    nombre: dispositivosConectados[id]?.nombre || id,
    ip: dispositivosConectados[id]?.ip || "desconocida",
    lastContact: ultimoContacto[id] ? new Date(ultimoContacto[id]).toISOString() : null,
    lastTelemetry: null
  };
  
  // Buscar la última telemetría para este dispositivo
  if (state && state.latestTelemetry && state.latestTelemetry.id === id) {
    deviceInfo.lastTelemetry = state.latestTelemetry;
  }
  
  res.json(deviceInfo);
});

// Exportar variables y funciones necesarias
export { app };
