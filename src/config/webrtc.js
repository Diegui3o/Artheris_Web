export function configureWebRTC(io, processImage) {
  // Almacena las salas y sus usuarios
  const rooms = new Map();

  io.of("/webrtc").on("connection", (socket) => {
    console.log("Nuevo cliente WebRTC conectado:", socket.id);

    socket.on("join", (roomId) => {
      console.log(`[${roomId}] ✅ Usuario ${socket.id} se unió.`);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const room = rooms.get(roomId);
      room.add(socket.id);
      socket.join(roomId);

      // Emitir 'joined' al cliente que se unió (no a toda la sala)
      socket.emit("joined", { roomId }); // <-- Cambio clave aquí

      // Notificar a los demás en la sala
      socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("offer", ({ sdp, type, roomId }) => {
      console.log(
        `[${roomId}] ➡️ Recibida OFERTA de ${socket.id}. Reenviando...`
      );
      socket.to(roomId).emit("offer", { sdp, type, from: socket.id });
    });

    socket.on("answer", ({ sdp, type, roomId }) => {
      console.log(
        `[${roomId}] ➡️ Recibida RESPUESTA de ${socket.id}. Reenviando...`
      );
      socket.to(roomId).emit("answer", { sdp, type, from: socket.id });
    });

    socket.on("candidate", ({ candidate, roomId }) => {
      console.log(
        `[${roomId}] ➡️ Recibido CANDIDATO de ${socket.id}. Reenviando...`
      );
      socket.to(roomId).emit("candidate", { candidate, from: socket.id });
    });

    socket.on("process-frame", async ({ image, roomId }) => {
      if (!image || !processImage) return;

      try {
        // Llama a la función de procesamiento que recibimos como parámetro
        const result = await processImage(image);

        // Emite el resultado de vuelta únicamente al cliente que lo envió
        socket.emit("analysis-result", result);

      } catch (error) {
        console.error(`[${roomId}] ❌ Error procesando frame de ${socket.id}: ${error.message}`);
        socket.emit("analysis-error", {
          error: "Error al procesar el frame en el servidor.",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("Cliente WebRTC desconectado:", socket.id);
      rooms.forEach((users, roomId) => {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          socket.to(roomId).emit("user-left", socket.id);
          if (users.size === 0) {
            rooms.delete(roomId);
          }
        }
      });
    });
  });
}
