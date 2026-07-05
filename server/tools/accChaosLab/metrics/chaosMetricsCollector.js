function collectMetrics(events, start, end) {
  const durations = events
    .map(e => e.duration)
    .filter(Boolean);

  const sorted = durations.sort((a, b) => a - b);

  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  const delays = events.filter(e => e.result?.decision === "DELAY").length;
  const allows = events.filter(e => e.result?.decision === "ALLOW").length;
  const transforms = events.filter(e => e.result?.decision === "TRANSFORM").length;

  return {
    totalEvents: events.length,
    durationMs: end - start,
    p95_latency: p95 || 0,
    avg_latency: durations.reduce((a, b) => a + b, 0) / (durations.length || 1),
    delay_rate: (delays / (events.length || 1)).toFixed(2),
    allow_rate: (allows / (events.length || 1)).toFixed(2),
    transform_rate: (transforms / (events.length || 1)).toFixed(2)
  };
}

module.exports = { collectMetrics };
