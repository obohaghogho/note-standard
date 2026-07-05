const { accGuard } = require("./accController");
const supabase = require("../../config/database");

const SHADOW_MODE = true; // Rollout configuration

// Asynchronous metrics buffer
const metricsBuffer = [];
function emitMetricAsync(metric) {
    metricsBuffer.push({ ...metric, ts: Date.now() });
    // In production, flush this buffer periodically via a background worker
}

async function accMiddleware(req, res, next) {
  // Recursion Prevention
  if (req.accContext?.isInternalRetry || req.accContext?.depthLimit > 0) {
      return next();
  }

  req.accContext = { isInternalRetry: true, depthLimit: 1 };

  try {
    const action = {
        conversationId: req.params.conversationId || req.body.conversation_id,
        sessionId: req.headers['x-session-id'] || req.body.session_id,
        metadata: req.body.metadata || {}
    };

    if (!action.conversationId) {
        return next(); // Not a governed route
    }

    const result = await accGuard(action, supabase, SHADOW_MODE);

    // Asynchronous Telemetry
    emitMetricAsync({
        event: "acc_decision",
        decision: result.decision,
        risk: result.risk,
        modelVersion: result.modelVersion,
        isShadowMode: SHADOW_MODE
    });

    if (SHADOW_MODE) {
        // In shadow mode, we NEVER block or mutate. We just log what we WOULD have done.
        console.log(`[ACC SHADOW MODE] Would have applied: ${result.decision} (Risk: ${result.risk})`);
        req.accDecision = { decision: "ALLOW", risk: 0 };
        return next();
    }

    req.accDecision = result;

    if (result.decision === "DELAY") {
        // Enforce backpressure (Client should apply exponential backoff)
        return res.status(409).json({
            ok: false,
            reason: "LEASE_UNSTABLE",
            message: "Consistency guard blocked mutation. Please stabilize lease.",
            retry_after_ms: 1000 
        });
    }

    if (result.decision === "TRANSFORM") {
        req.forceLeaseTakeover = true;
    }

    next();
  } catch (err) {
      console.error("[ACC Middleware Error]", err);
      // Because ACC enforces FAIL-CLOSED inside accGuard, this catch block handles
      // catastrophic infrastructure failures (e.g. out of memory, Express parsing fails).
      // We still FAIL CLOSED for maximum consistency safety.
      return res.status(503).json({ ok: false, reason: "ACC_SYSTEM_FAILURE" });
  }
}

module.exports = { accMiddleware, SHADOW_MODE };
