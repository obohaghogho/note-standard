const { getCachedLease, setCachedLease } = require("./accCache");
const { getLeaseSnapshot } = require("./leaseSnapshot");
const { computeRisk, ACC_MODEL_VERSION } = require("./riskEngine");
const { decide } = require("./decisionTable");

const ACC_BUDGET_MS = 5;
const ACC_FAILURE_MODE = "DELAY";

async function _executeAccGuard(action, supabase, isShadowMode) {
  let lease = getCachedLease(action.conversationId);

  if (lease === null) {
    lease = await getLeaseSnapshot(action.conversationId, supabase);
    setCachedLease(action.conversationId, lease, isShadowMode);
  }

  const risk = computeRisk(action, lease);
  const decision = decide(risk);

  return {
    decision,
    risk,
    modelVersion: ACC_MODEL_VERSION
  };
}

async function accGuard(action, supabase, isShadowMode = false) {
  const startTime = performance.now();

  try {
    // Wrap in a promise race to enforce hard timeout
    const result = await Promise.race([
      _executeAccGuard(action, supabase, isShadowMode),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ACC_TIMEOUT")), ACC_BUDGET_MS))
    ]);

    const duration = performance.now() - startTime;
    if (duration > ACC_BUDGET_MS) {
       console.warn(`[ACC WARNING] Execution exceeded budget: ${duration.toFixed(2)}ms`);
    }

    return result;

  } catch (err) {
    console.error("[ACC FATAL ERROR] Failing CLOSED.", err.message);
    return {
      decision: ACC_FAILURE_MODE,
      risk: 1.0,
      modelVersion: ACC_MODEL_VERSION,
      error: err.message
    };
  }
}

module.exports = { accGuard };
