async function runRetryChain(config, acc) {
  const events = [];

  let attempt = 0;

  for (let i = 0; i < config.requests; i++) {
    let success = false;

    while (!success && attempt < config.maxRetries) {
      const start = performance.now();
      const res = await acc.sendMessage({
        messageId: `retry-${i}`,
        attempt
      });

      events.push({
        type: "RETRY_ATTEMPT",
        attempt,
        duration: performance.now() - start,
        result: res
      });

      success = res.status === "OK" || res.decision === "ALLOW";
      attempt++;
    }

    attempt = 0;
  }

  return events;
}

module.exports = { runRetryChain };
