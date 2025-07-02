# FlightControl – Interfaz WebSocket para monitoreo y control de un dron IoT en tiempo real

**FlightControl** es una estación base moderna basada en tecnologías web que permite monitorear y controlar un cuadricóptero en tiempo real mediante comunicación WebSocket. El dron, equipado con un microcontrolador ESP32, se comunica directamente con un servidor Node.js, el cual retransmite datos a una interfaz web desarrollada en React y TypeScript.

Este proyecto fue desarrollado como parte de un sistema de pruebas para diversos algoritmos de control aplicados a vehículos aéreos no tripulados (UAV), con énfasis en la accesibilidad, visualización clara y registro de datos para análisis posteriores.

---

## 🛰️ Características principales

- Comunicación bidireccional en tiempo real (WebSocket puro).
- Visualización de telemetría en directo (ángulos, altura, PWM de motores, etc.).
- Envío de comandos remotos al dron (LED, motores, modos de vuelo).
- Registro y almacenamiento de vuelos en una base de datos de series temporales (QuestDB).
- Modo simulación (en desarrollo).
- Interfaz intuitiva construida en React + TypeScript.

---

## 🔧 Requisitos

### Hardware:
- Placa **ESP32** (o similar)
- Cuadricóptero funcional con sensores (ej. MPU6050, Magnetometro)
- Red Ethernet(sin necesidad de internet)

### Software:
- Node.js (versión 22 o superior)
- Visual Studio Code (u otro editor)
- Navegador (Chrome, Firefox, etc.)
- Docker Desktop (opcional para QuestDB)

---

## 🗂️ Estructura del proyecto

Imagen referencial de la estructura del proyecto

## ⚙️ Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/tu-usuario/flightcontrol.git
   cd flightcontrol
   ```
   O descarga el .zip compirmido directamente
2. Instala las dependencias (primero backend luego fronted)
   ```bash
   npm install
   cd client
   npm install
   ```
3. Inicia el servidor remoto (primero backend luego fronted)
   ```bash
   npm run dev
   cd client
   npm run dev
   ```
4. Abre el navegador en http://localhost:5173

