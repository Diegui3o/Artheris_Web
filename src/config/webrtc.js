export function configureWebRTC(io) {
  // Stores rooms and users
  const rooms = new Map();

  io.of("/webrtc").on("connection", (socket) => {
    console.log("New webrtc client connected:", socket.id);

    socket.on("join", (roomId) => {
      console.log(`[${roomId}] ✅ User ${socket.id} joined.`);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const room = rooms.get(roomId);
      room.add(socket.id);
      socket.join(roomId);

      // Issue 'joined' to the client who joined (not the entire room)
      socket.emit("joined", { roomId });

      // Notify others in the room
      socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("offer", ({ sdp, type, roomId }) => {
      console.log(
        `[${roomId}] ➡️ Received ${socket.id} offer.`
      );
      socket.to(roomId).emit("offer", { sdp, type, from: socket.id });
    });

    socket.on("answer", ({ sdp, type, roomId }) => {
      console.log(
        `[${roomId}] ➡️ Received response from ${socket.id}. Forwarding...`
      );
      socket.to(roomId).emit("answer", { sdp, type, from: socket.id });
    });

    socket.on("candidate", ({ candidate, roomId }) => {
      console.log(
        `[${roomId}] ➡️ Received candidate from ${socket.id}. Forwarding...`
      );
      socket.to(roomId).emit("candidate", { candidate, from: socket.id });
    });

    socket.on("disconnect", () => {
      console.log("Webrtc client disconnected:", socket.id);
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
