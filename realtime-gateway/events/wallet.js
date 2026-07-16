module.exports = (io, socket) => {
  const updateBalance = (data) => {
    // Data expected: { userId, balance, currency }
    if (data.userId) {
       io.to(`user:${data.userId}`).emit('wallet:update', {
         balance: data.balance,
         currency: data.currency
       });
    }
  };

  const swapComplete = (data) => {
    if (data.userId) {
      io.to(`user:${data.userId}`).emit('swap:update', {
        status: 'completed',
        details: data.details
      });
    }
  };

  socket.on('wallet:subscribe', () => {
    socket.join(`user:${socket.userId}`);
    console.log(`[Wallet] User ${socket.userId} subscribed to wallet updates`);
  });

  return { updateBalance, swapComplete };
};
