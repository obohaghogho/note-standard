const { runReplay } = require("../replayDebugger/replayEngine");
const { recover } = require("./recoveryEngine");

async function validateRecovery(conversationId) {
  const replay = await runReplay({ conversationId });
  return replay.anomalies.length === 0;
}

async function runSelfHealing(anomalies, context) {
  const results = await recover(anomalies, context);
  const healed = await validateRecovery(context.conversationId);

  return {
    results,
    fullyHealed: healed
  };
}

module.exports = { validateRecovery, runSelfHealing };
