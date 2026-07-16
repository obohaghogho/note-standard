const { forceTakeoverLease } = require('../../rpc/sessionArbitration');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runLeaseWar({ conversationId, devices, metrics }) {
  const deviceIds = Array.from({ length: devices }, (_, i) => `device-${i}`);
  
  // NOTE: For the simulation, we'll bypass fetch and call the RPC wrapper directly,
  // since fetch might require a valid Auth token or port resolving.
  // The actual backend routes are protected by authMiddleware.

  const interval = setInterval(async () => {
    const winner = deviceIds[Math.floor(Math.random() * deviceIds.length)];

    try {
      // Simulate session_id for the virtual devices
      const sessionId = `chaos-session-${winner}`;
      
      const result = await forceTakeoverLease({ 
        conversationId, 
        sessionId, 
        deviceId: winner 
      });

      if (result && result.success) {
        metrics.record("lease_attempt");
      } else {
        metrics.record("lease_conflict");
      }
    } catch (e) {
      metrics.record("lease_conflict");
    }
  }, 300);

  await sleep(5000);
  clearInterval(interval);
}

module.exports = { runLeaseWar };
