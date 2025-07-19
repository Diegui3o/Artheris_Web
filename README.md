# Artheris FlightControl – Interfaz WebSocket para monitoreo y control de un dron IoT en tiempo real

**Artheris FlightControl** es una estación base moderna y de código abierto, desarrollada con tecnologías web, que permite el monitoreo y control en tiempo real de un cuadricóptero IoT. Utiliza comunicación WebSocket pura para lograr baja latencia y alta fiabilidad en la transmisión de datos entre el dron (basado en ESP32) y una interfaz web intuitiva construida en React + TypeScript.

Este software fue diseñado como plataforma de pruebas para experimentación y validación de algoritmos de control en vehículos aéreos no tripulados (UAV), priorizando la accesibilidad, la visualización clara de telemetría y el registro robusto de datos para análisis científico y reproducibilidad.

---

![MIT License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-brightgreen)
![React](https://img.shields.io/badge/React-18%2B-blue)
![WebSocket](https://img.shields.io/badge/WebSocket-Real%20Time-orange)

## 🛰️ Características principales

- Comunicación bidireccional en tiempo real mediante WebSocket puro.
- Visualización avanzada de telemetría (ángulos, altura, PWM de motores, estado de sensores, etc.).
- Envío de comandos remotos al dron: control de LED, motores y selección de modos de vuelo.
- Registro automático y almacenamiento seguro de vuelos en una base de datos de series temporales (QuestDB), facilitando el análisis y la trazabilidad.
- Modo simulación (en desarrollo) para pruebas sin hardware físico.
- Interfaz web intuitiva y responsiva, desarrollada en React + TypeScript, compatible con dispositivos móviles y de escritorio.

---
### 🚦 Integración de hardware flexible

- Compatible con múltiples sensores (IMU, magnetómetro, temperatura, presión, etc.).
- Arquitectura modular: puedes adaptar el sistema fácilmente a diferentes modelos de drones o añadir nuevos periféricos.

### 📡 WebSocket puro y arquitectura moderna

- Comunicación en tiempo real sin dependencias externas, logrando baja latencia y alta robustez.
- Backend y frontend desacoplados: puedes conectar otras interfaces (CLI, móvil, etc.) fácilmente.

### 📊 Visualización y análisis en tiempo real

- Gráficas interactivas para telemetría y comandos.
- Historial de vuelos accesible desde la web para análisis y comparación.

### 🛠️ Exportación y reproducibilidad

- Exporta tus vuelos y experimentos a CSV/JSON para análisis en Python, Matlab, R, etc.
- Scripts y plantillas incluidos para facilitar la configuración y conexión del ESP32.

### 🧑‍💻 Casos de uso destacados

- **Educación:** Ideal para prácticas de laboratorio en universidades y formación técnica.
- **Investigación:** Plataforma base para experimentos en control, robótica o IoT.
- **Prototipado rápido:** Perfecto para makers y startups que quieran validar ideas de drones conectados.

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

El proyecto está organizado en dos partes principales:

- `/server`: Código backend en Node.js para gestión de WebSocket, almacenamiento y API.
- `/client`: Interfaz web en React + TypeScript para visualización y control.

![Diagrama del sistema](./assets/diagram.svg)
_Imagen referencial de la arquitectura del sistema._

## ⚙️ Instalación

**Requisitos previos:**

- Node.js (versión 22 o superior)
- npm
- (Opcional) Docker Desktop para QuestDB
- Acceso a un ESP32 y red local (no requieres de internet)

**Pasos de instalación:**

1. Clona este repositorio:

   ```bash
   git clone https://github.com/Diegui3o/websockets_web.git
   cd websockets_web
   ```

   O descarga el .zip comprimido directamente.

2. Instala las dependencias del backend:

   ```bash
   npm install
   ```

3. Inicia el servidor backend:

   ```bash
   npm run dev
   ```

4. Abre una nueva terminal e instala las dependencias del frontend:

   ```bash
   cd client
   npm install
   ```

5. Inicia el servidor frontend:

   ```bash
   npm run dev
   ```

6. Abre tu navegador en [http://localhost:5173](http://localhost:5173) para acceder a la interfaz web.

**Nota:** Si deseas almacenar vuelos, asegúrate de tener QuestDB corriendo en Docker antes de iniciar el backend.

## 🚀 Modo de uso

Conecta el ESP32 con la siguiente configuracion.

```bash
// ================= CONFIGURACIÓN =================
const char *ssid = "Name_Wifi";
const char *password = "Password";
const char *websocket_server = "IP";
const int websocket_port = 3003;
const char *websocket_path = "/esp32";
```

Notamos que para "websocket_server" se debe colocar una IP para eso debe ir a

```bash
cmd
```

luego

```bash
ipconfig
```

y buscar

```bash
Adaptador de Ethernet Ethernet:
   Sufijo DNS específico para la conexión. . :
   Vínculo: dirección IPv6 local. . . : oooo::oooo:oooo:oooo:oooo%o
   Dirección IPv4. . . . . . . . . . . . . . : xxx.xxx.1.11
   Máscara de subred . . . . . . . . . . . . : yyy.yyy.yyy.0
   Puerta de enlace predeterminada . . . . . : zzz.zzz.1.1
```

Entonces rellenamos los siguientes campos con esos datos

```bash
// ================= CONFIGURACIÓN =================
const char *websocket_server = "xxx.xxx.1.11";

// Configuración IP fija
IPAddress local_IP(xxx, xxx, 1, 200);
IPAddress gateway(xxx, xxx, 1, 1);
IPAddress subnet(yyy, yyy, yyy, 0);
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);
```

Para usar esas variables en los siguientes campos

```bash
WiFi.begin(ssid, password);
!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)
webSocket.begin(websocket_server, websocket_port, websocket_path);
webSocket.onEvent(webSocketEvent);
webSocket.setReconnectInterval(3000);
webSocket.enableHeartbeat(15000, 3000, 2);
```

El ESP32 se conecta automáticamente al servidor WebSocket y en la terminal de backend aparecerá

```bash
✅ ESP32 conectado por WebSocket puro desde ${clientIP}
```

Abre la interfaz web (http://localhost:5173) para visualizar datos de vuelo y enviar comandos.

Si QuestDB está activado, los vuelos pueden almacenarse y analizarse posteriormente.

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT.

