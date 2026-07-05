let originalFetch = null;

async function applyNetworkJitter(config) {
  if (!config) {
    // Teardown
    if (originalFetch) {
      global.fetch = originalFetch;
      originalFetch = null;
    }
    return;
  }

  global.__NETWORK_CHAOS__ = config;

  if (!originalFetch) {
      originalFetch = global.fetch;
  }

  global.fetch = async (...args) => {
    const { jitter = 0, dropRate = 0, duplicateRate = 0 } =
      global.__NETWORK_CHAOS__;

    const delay = Math.random() * jitter;

    await new Promise(r => setTimeout(r, delay));

    if (Math.random() < dropRate) {
      throw new Error("Simulated network drop");
    }

    const response = await originalFetch(...args);

    // duplicate RPC simulation
    if (Math.random() < duplicateRate) {
      originalFetch(...args).catch(() => {}); // Fire and forget duplicate
    }

    return response;
  };
}

module.exports = { applyNetworkJitter };
