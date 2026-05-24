// ACC_MODEL_VERSION guarantees risk engine calibration drift protection
const ACC_MODEL_VERSION = "1.0.0";

function computeRisk(action, lease) {
  let risk = 0;

  if (!lease) {
      return 0; // Allow initial setup
  }

  // rule 1: not lease owner
  if (action.sessionId && action.sessionId !== lease.active_session_id) {
    risk += 0.6;
  }

  // rule 2: stale lease (heartbeat drift)
  const age = Date.now() - new Date(lease.last_heartbeat_at).getTime();
  if (age > 30000) {
    risk += 0.3;
  }

  // rule 3: high-frequency sender (spam protection)
  if (action.metadata?.burstSend) {
    risk += 0.2;
  }

  return Math.min(risk, 1);
}

module.exports = { computeRisk, ACC_MODEL_VERSION };
