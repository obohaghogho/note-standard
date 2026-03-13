module.exports = (io, socket) => {
  const sendNotification = (data) => {
    const { userId, notification } = data;
    if (userId) {
      io.to(`user:${userId}`).emit('notification:new', notification);
      console.log(`[Notification] Sent to user ${userId}`);
    }
  };

  socket.on('notification:mark_read', (data) => {
    // This could optionally talk to the main backend API
    // or we just acknowledge it.
    console.log(`[Notification] User ${socket.userId} marked as read`);
  });

  return { sendNotification };
};
