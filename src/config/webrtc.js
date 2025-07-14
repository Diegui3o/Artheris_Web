export function configureWebRTC(io) {
  // Almacena las salas y sus usuarios
  const rooms = new Map();

  io.of("/webrtc").on("connection", (socket) => {
    console.log("Nuevo cliente WebRTC conectado:", socket.id);

    socket.on("join", (roomId) => {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const room = rooms.get(roomId);
      room.add(socket.id);
      socket.join(roomId);
      console.log(`Usuario ${socket.id} se unió a la sala ${roomId}`);

      // Notificar a los demás en la sala que hay un nuevo usuario
      socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("offer", ({ sdp, type, to, roomId }) => {
      console.log(`Enviando oferta de ${socket.id} a ${to} en sala ${roomId}`);
      socket.to(to).emit("offer", { sdp, type, from: socket.id, roomId });
    });

    socket.on("answer", ({ sdp, type, to, roomId }) => {
      console.log(
        `Enviando respuesta de ${socket.id} a ${to} en sala ${roomId}`
      );
      socket.to(to).emit("answer", { sdp, type, from: socket.id, roomId });
    });

    socket.on("candidate", ({ candidate, to, roomId }) => {
      socket.to(to).emit("candidate", {
        candidate,
        from: socket.id,
        roomId,
      });
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
