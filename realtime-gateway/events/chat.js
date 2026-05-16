module.exports = (io, socket) => {
  // Join specific conversation room (direct chat)
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`[Gateway] User ${socket.userId} joined room: ${roomId}`);
  });

  // chat:join is a newer alias for direct conversations
  socket.on('chat:join', (roomId) => {
    socket.join(roomId);
    console.log(`[Gateway] User ${socket.userId} joined chat room: ${roomId}`);
  });

  // team:join — joins a team/group chat room
  socket.on('team:join', (teamId) => {
    socket.join(teamId);
    console.log(`[Gateway] User ${socket.userId} joined team room: ${teamId}`);
  });

  // Handle typing status (direct via gateway for lower latency)
  socket.on('typing', (data) => {
    const { conversationId, teamId } = data;
    const room = teamId || conversationId;
    if (!room) return;
    socket.to(room).emit('chat:typing', {
      userId: socket.userId,
      username: data.username,
      isTyping: true,
      conversationId: conversationId || null,
      teamId: teamId || null,
    });
  });

  socket.on('stop_typing', (data) => {
    const { conversationId, teamId } = data;
    const room = teamId || conversationId;
    if (!room) return;
    socket.to(room).emit('chat:typing', {
      userId: socket.userId,
      username: data.username,
      isTyping: false,
      conversationId: conversationId || null,
      teamId: teamId || null,
    });
  });
};
