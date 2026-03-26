module.exports = (io, socket) => {
  // WebRTC Signalling through Socket.IO
  socket.on('call:init', (data) => {
    const { to, type, conversationId, peerId } = data;
    console.log(`[Call] Init from ${socket.userId} (${socket.userName}) to ${to}`);
    
    io.to(`user:${to}`).emit('call:incoming', {
      from: socket.userId,
      fromName: socket.userName,
      fromAvatar: socket.userAvatar,
      type,
      conversationId,
      peerId
    });
  });

  socket.on('call:ready', (data) => {
    const { to, peerId } = data;
    io.to(`user:${to}`).emit('call:ready', {
      from: socket.userId,
      peerId
    });
  });

  socket.on('call:end', (data) => {
    const { to, conversationId } = data;
    io.to(`user:${to}`).emit('call:ended', {
      from: socket.userId,
      conversationId
    });
  });
};
