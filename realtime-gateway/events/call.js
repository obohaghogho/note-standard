module.exports = (io, socket) => {
  // ─── WebRTC Signaling ───────────────────────────────────────────
  
  // 1. Initiate Call
  socket.on('call:initiate', (data) => {
    const { to, type, conversationId, peerId } = data;
    console.log(`[Call] 📞 ${socket.userId} → ${to} (${type})`);
    
    io.to(`user:${to}`).emit('call:incoming', {
      from: socket.userId,
      fromName: socket.userName,
      fromAvatar: socket.userAvatar,
      type,
      conversationId,
      peerId
    });
  });

  // 2. Peer Ready (Signaling established)
  socket.on('call:ready', (data) => {
    const { to, peerId } = data;
    io.to(`user:${to}`).emit('call:ready', {
      from: socket.userId,
      peerId
    });
  });

  // 3. Reject Call
  socket.on('call:reject', (data) => {
    const { to } = data;
    console.log(`[Call] ✗ ${socket.userId} rejected call from ${to}`);
    io.to(`user:${to}`).emit('call:rejected', { from: socket.userId });
  });

  // 4. End Call
  socket.on('call:end', (data) => {
    const { to, conversationId } = data;
    console.log(`[Call] 🏁 ${socket.userId} ended call with ${to}`);
    io.to(`user:${to}`).emit('call:ended', {
      from: socket.userId,
      conversationId
    });
  });

  // 5. Call Timeout
  socket.on('call:timeout', (data) => {
    const { to } = data;
    io.to(`user:${to}`).emit('call:timeout', { from: socket.userId });
  });
};
