async function runClockSkew(config, acc) {
  const events = [];

  const skewedTimes = config.skews;

  for (const skew of skewedTimes) {
    const start = performance.now();
    const fakeNow = Date.now() + skew;

    const res = await acc.processWithClientTime({
      clientTime: fakeNow
    });

    events.push({
      type: "CLOCK_SKEW",
      skew,
      duration: performance.now() - start,
      result: res
    });
  }

  return events;
}

module.exports = { runClockSkew };
