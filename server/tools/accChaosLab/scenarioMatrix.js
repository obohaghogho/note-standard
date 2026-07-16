function buildScenario(level) {
  if (level === 1) {
    return {
      leaseStorm: { devices: ["A", "B"], cycles: 2 },
      cacheDesync: { iterations: 10 },
      ackDelay: { messages: 10, delay: 150 },
      burstWrite: { batchSize: 20, payloadSize: 50 },
      clockSkew: { skews: [0, 1000, -1000] },
      retryChain: { requests: 10, maxRetries: 2 }
    };
  }

  if (level === 2) {
    return {
      leaseStorm: { devices: ["A", "B", "C", "D"], cycles: 5 },
      cacheDesync: { iterations: 50 },
      ackDelay: { messages: 50, delay: 400 },
      burstWrite: { batchSize: 200, payloadSize: 200 },
      clockSkew: { skews: [0, 5000, -5000, 10000] },
      retryChain: { requests: 100, maxRetries: 5 }
    };
  }

  return {
    leaseStorm: { devices: Array.from({ length: 10 }, (_, i) => `D${i}`), cycles: 20 },
    cacheDesync: { iterations: 200 },
    ackDelay: { messages: 200, delay: 1000 },
    burstWrite: { batchSize: 1000, payloadSize: 500 },
    clockSkew: { skews: [0, 30000, -30000] },
    retryChain: { requests: 1000, maxRetries: 10 }
  };
}

module.exports = { buildScenario };
