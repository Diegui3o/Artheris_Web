<<<<<<< HEAD
# websockets_web
Comunicacion websockets para un esp32
=======
# 🚀 Node.js MQTT Backend

Este repositorio contiene un servidor backend desarrollado con **Node.js**, **Express** y **MQTT**, diseñado para controlar y monitorear un sistema de motores y sensores en tiempo real.

El servidor se comunica con un broker **MQTT** para recibir datos de sensores (**ángulos, tasas, aceleraciones, giroscopio, filtro de Kalman, etc.**) y enviar comandos de control (**encender/apagar motores, cambiar modos, etc.**). Además, utiliza **WebSockets (Socket.IO)** para proporcionar actualizaciones en tiempo real a un frontend desarrollado en **React**.

---

## 📡 Tecnologías Utilizadas

- **Node.js** - Entorno de ejecución para JavaScript
- **Express.js** - Framework web minimalista para Node.js
- **MQTT.js** - Cliente MQTT para la comunicación con el broker
- **Socket.IO** - WebSockets para la comunicación en tiempo real
- **Cors & Body-Parser** - Middleware para manejo de CORS y parsing de JSON

---

## ⚙️ Instalación

1.  Clona este repositorio:

    ```sh
    git clone https://github.com/Diegui3o/mqtt_web.git
    cd mqtt_web-main

    ```

2.  Instala las dependencias:

    ```sh
    npm install

    ```

3.  Configura las variables de entorno en `config/env.js`:

    ```js
    module.exports.envs = {
      PORT: 3000,
      MQTT_BROKER_URL: "mqtt://broker.hivemq.com",
      CONTROL_TOPIC: "drone/control",
      ANGLES_TOPIC: "drone/angles",
      RATES_TOPIC: "drone/rates",
      ACC_TOPIC: "drone/acc",
      GYRO_TOPIC: "drone/gyro",
      KALMAN_TOPIC: "drone/kalman",
      MOTORS_TOPIC: "drone/motors",
      MODE_TOPIC: "drone/mode",
    };
    ```

4.  Inicia el servidor:

    ```sh
    npm run dev

    ```

---

## 📡 Comunicación MQTT

El servidor se suscribe a los siguientes tópicos:

- `drone/angles` → Recibe datos de ángulos
- `drone/rates` → Recibe tasas de cambio
- `drone/acc` → Recibe aceleraciones
- `drone/gyro` → Recibe datos del giroscopio
- `drone/kalman` → Recibe ángulos filtrados con Kalman
- `drone/motors` → Recibe estado de los motores
- `drone/mode` → Recibe y actualiza el modo de operación

Y publica comandos en `drone/control` para controlar los motores y LEDs.

---

## 🎯 Funcionalidades Principales

✅ **Recepción de datos en tiempo real** desde sensores vía MQTT  
✅ **Control de motores y LEDs** mediante comandos MQTT  
✅ **Actualización de estado en el frontend** con WebSockets  
✅ **Modo de operación configurable** (0, 1 o 2)  
✅ **Middleware para manejo de errores** en Express

---

## 🛠 Próximas Mejoras

🔹 Integración con **InfluxDB** para almacenamiento de datos históricos  
🔹 Implementación de **JWT** para autenticación de usuarios  
🔹 Dashboard avanzado en **React** para visualización de datos

---

## 🤝 Contribución

¡Las contribuciones son bienvenidas! Si deseas mejorar este proyecto:

1.  Haz un **fork** del repositorio
2.  Crea una rama con tu mejora: `git checkout -b feature/nueva-funcionalidad`
3.  Realiza un **commit** de tus cambios: `git commit -m "Añadir nueva funcionalidad"`
4.  Sube tu rama: `git push origin feature/nueva-funcionalidad`
5.  Abre un **Pull Request** 🚀

---

## 📝 Licencia

Este proyecto está bajo la licencia **MIT**. Puedes usarlo y modificarlo libremente.

---

💻 **Desarrollado por [Diego Mejia](https://github.com/Diegui3o/)**
>>>>>>> fb0a156 (Primer commit)
