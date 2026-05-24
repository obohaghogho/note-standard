const { buildScenario } = require("./scenarioMatrix");
const { runLeaseStorm } = require("./attackVectors/leaseStorm");
const { runCacheDesync } = require("./attackVectors/cacheDesyncFlood");
const { runAckDelay } = require("./attackVectors/ackDelayLoop");
const { runBurstWrite } = require("./attackVectors/burstWriteAmplifier");
const { runClockSkew } = require("./attackVectors/clockSkewInjector");
const { runRetryChain } = require("./attackVectors/retryAmplificationChain");

const { validateInvariants } = require("./invariants/accInvariantValidator");
const { replayLedger } = require("./invariants/ledgerReplayer");
const { collectMetrics } = require("./metrics/chaosMetricsCollector");

async function runChaos(level = 1, accController) {
  const scenario = buildScenario(level);

  const start = performance.now();

  const results = {
    level,
    events: [],
    violations: [],
    metrics: {}
  };

  // Execute attack vectors in parallel (war mode)
  const attacks = await Promise.all([
    runLeaseStorm(scenario.leaseStorm, accController),
    runCacheDesync(scenario.cacheDesync, accController),
    runAckDelay(scenario.ackDelay, accController),
    runBurstWrite(scenario.burstWrite, accController),
    runClockSkew(scenario.clockSkew, accController),
    runRetryChain(scenario.retryChain, accController)
  ]);

  results.events = attacks.flat();

  // Validate system integrity
  const invariantReport = validateInvariants(results.events);
  const replayReport = await replayLedger(results.events);

  results.violations = [
    ...invariantReport.violations,
    ...replayReport.violations
  ];

  const end = performance.now();

  results.metrics = collectMetrics(results.events, start, end);

  return results;
}

module.exports = { runChaos };
