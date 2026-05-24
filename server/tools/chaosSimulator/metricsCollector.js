function collectMetrics() {
  const metrics = {
    lease_attempt: 0,
    lease_conflict: 0,
    queue_flush: 0,
    queue_failure: 0
  };

  return {
    record(key) {
      metrics[key] = (metrics[key] || 0) + 1;
    },
    flush() {
      return { ...metrics };
    }
  };
}

module.exports = { collectMetrics };
