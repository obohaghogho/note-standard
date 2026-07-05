async function runAckDelay(config, acc) {
  const events = [];

  for (let i = 0; i < config.messages; i++) {
    const start = performance.now();

    const res = await acc.markDelivered({
      messageId: `msg-${i}`,
      delayInjected: config.delay
    });

    events.push({
      type: "ACK_DELAY",
      duration: performance.now() - start,
      result: res
    });
  }

  return events;
}

module.exports = { runAckDelay };
