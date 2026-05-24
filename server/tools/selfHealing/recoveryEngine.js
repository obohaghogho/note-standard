const { classifyFailure } = require("./failureClassifier");
const { resolveStrategy } = require("./selfHealingOrchestrator");

async function recover(anomalies, context) {
  const results = [];

  for (const anomaly of anomalies) {
    const type = classifyFailure(anomaly);
    const strategy = resolveStrategy(type);

    if (!strategy) continue;

    const result = await strategy.execute(anomaly, context);

    results.push({
      anomaly,
      strategy: strategy.name,
      success: result.success
    });
  }

  return results;
}

module.exports = { recover };
