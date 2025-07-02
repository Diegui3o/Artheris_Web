Título del Proyecto

Resumen o descripción corta del propósito del software

Características principales (bullet points)

Arquitectura general o esquema del sistema (puede ser una imagen o un diagrama opcional)

Requisitos de hardware/software

Instrucciones de instalación

Modo de uso (cómo lanzar el servidor, conectar el dron, etc.)

Ejemplo de flujo de datos o comandos

Licencia

Cita del artículo (si ya tienes DOI o formato)

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
- Placa **ESP32**
- Cuadricóptero funcional con sensores (ej. MPU6050)
- Conexión WiFi

### Software:
- Node.js (versión 18 o superior)
- Navegador moderno (Chrome, Firefox, etc.)
- QuestDB (opcional, para almacenamiento de datos)

---

## 🗂️ Estructura del proyecto
