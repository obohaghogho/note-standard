async function runLeaseStorm(config, acc) {
  const events = [];
  const devices = config.devices;

  for (let i = 0; i < config.cycles; i++) {
    for (const device of devices) {
      const start = performance.now();
      
      // Simulate calling the ACC guard
      // acc in this context should be a mock or wrapper around accGuard
      const event = await acc.markLease({
        deviceId: device,
        leaseId: config.leaseId || 'chaos-lease-1',
        timestamp: Date.now()
      });

      events.push({
        type: "LEASE_EVENT",
        deviceId: device,
        duration: performance.now() - start,
        result: event
      });
    }
  }

  return events;
}

module.exports = { runLeaseStorm };
