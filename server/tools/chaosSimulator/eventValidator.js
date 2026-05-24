const { runReplay } = require('../replayDebugger/replayEngine');

async function validateReplay(conversationId) {
  // Call the replay engine directly without fetch
  const replay = await runReplay({ conversationId });

  const anomalies = [];

  for (const a of replay.anomalies || []) {
    anomalies.push(a);
  }

  return {
    ok: anomalies.length === 0,
    anomalies,
    replay
  };
}

module.exports = { validateReplay };
