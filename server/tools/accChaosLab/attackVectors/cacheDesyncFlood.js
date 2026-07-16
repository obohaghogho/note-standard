async function runCacheDesync(config, acc) {
  const events = [];

  for (let i = 0; i < config.iterations; i++) {
    const start = performance.now();
    const staleSnapshot = {
      version: Date.now() - 10000,
      checksum: "stale-" + i
    };

    const res = await acc.evaluateSnapshot(staleSnapshot);

    events.push({
      type: "CACHE_DESYNC",
      duration: performance.now() - start,
      accepted: res.accepted,
      snapshot: staleSnapshot
    });
  }

  return events;
}

module.exports = { runCacheDesync };
