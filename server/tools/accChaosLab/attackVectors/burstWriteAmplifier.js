async function runBurstWrite(config, acc) {
  const events = [];

  const batch = Array.from({ length: config.batchSize });

  await Promise.all(
    batch.map(async (_, i) => {
      const start = performance.now();

      const res = await acc.sendMessage({
        messageId: `burst-${i}`,
        payload: "x".repeat(config.payloadSize)
      });

      events.push({
        type: "BURST_WRITE",
        duration: performance.now() - start,
        result: res
      });
    })
  );

  return events;
}

module.exports = { runBurstWrite };
