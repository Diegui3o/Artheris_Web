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
![Diagrama del sistema](./assets/diagrama.svg)
Imagen referencial de la estructura del proyecto

## ⚙️ Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/Diegui3o/websockets_web.git
   cd websockets_web
   ```
   O descarga el .zip comprimido directamente
2. Instala las dependencias (Backend)
   ```bash
   npm install
   ```
2. Inicia el servidor remoto (Backend)
   ```bash
   npm run dev
   ```
3. Inciar una nueva termina para intalar las dependencias (Fronted)
   ```bash
   cd client
   npm install
   ```
3. Inicia el servidor remoto (Fronted)
   ```bash
   npm run dev
   ```
4. Abre el navegador en http://localhost:5173

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

##  📄 Licencia
Este proyecto está licenciado bajo la Licencia MIT.
