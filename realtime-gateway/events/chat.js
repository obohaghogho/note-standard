module.exports = (io, socket) => {
  // Join specific conversation room
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`[Gateway] User ${socket.userId} joined room: ${roomId}`);
  });

  // chat:join is a newer alias
  socket.on('chat:join', (roomId) => {
    socket.join(roomId);
  });

  // Handle typing status (direct via gateway for lower latency)
  socket.on('typing', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('chat:typing', {
      userId: socket.userId,
      username: data.username,
      isTyping: true
    });
  });

  socket.on('stop_typing', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('chat:typing', {
      userId: socket.userId,
      username: data.username,
      isTyping: false
    });
  });
};
