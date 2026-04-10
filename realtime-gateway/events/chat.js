module.exports = (io, socket) => {
  // Join specific conversation room
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`[Gateway] User ${socket.userId} joined room: ${roomId}`);
  });

  // Leave room
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
  });

  // Handle typing status (direct via gateway for lower latency)
  socket.on('typing', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('user_typing', {
      userId: socket.userId,
      username: data.username,
      isTyping: true
    });
  });

  socket.on('stop_typing', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('user_typing', {
      userId: socket.userId,
      username: data.username,
      isTyping: false
    });
  });
};
