const { generateScenario } = require("./scenarioFactory");
const { applyNetworkJitter } = require("./networkJitter");
const { runLeaseWar } = require("./leaseWarSimulator");
const { runOfflineStorm } = require("./offlineStorm");
const { collectMetrics } = require("./metricsCollector");
const { validateReplay } = require("./eventValidator");

async function runChaosScenario({ conversationId, level }) {
  const metrics = collectMetrics();

  const scenario = generateScenario(level, conversationId);

  try {
    await applyNetworkJitter(scenario.network);

    // Run lease war concurrently without blocking the main event loop
    const leasePromise = runLeaseWar({
      conversationId,
      devices: scenario.devices,
      metrics
    });

    await runOfflineStorm({
      conversationId,
      queueDepth: scenario.queueDepth,
      metrics
    });

    // Await lease war to finish
    await leasePromise;

    const replayResult = await validateReplay(conversationId);

    return {
      success: replayResult.anomalies.length === 0,
      replay: replayResult,
      metrics: metrics.flush()
    };

  } catch (err) {
    return {
      success: false,
      error: err.message,
      metrics: metrics.flush()
    };
  } finally {
    // Teardown network jitter hooks
    applyNetworkJitter(null);
  }
}

module.exports = { runChaosScenario };
