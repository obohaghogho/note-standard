const crypto = require("crypto");

/**
 * integrityVerifier.js
 *
 * Independent integrity pass over the certification event stream.
 * Only flags events where:
 *   - An explicit ALLOW_INVALID was emitted (ACC let an invalid mutation through)
 *   - An ORPHAN_DELIVERY with no preceding SENT (genuine ledger causality break)
 *
 * War-game events (multi-device lease storms) are expected inputs, not violations.
 */
function verifyIntegrity(events) {
  const violations = [];
  const messageState = new Map();

  for (const e of events) {
    // Only flag explicit ALLOW_INVALID from ACC responses
    if (e.result?.status === "ALLOW_INVALID" || e.result?.decision === "ALLOW_INVALID") {
      violations.push({
        type: "INVALID_ALLOW_DETECTED"
      });
    }

    // Track message causal ordering
    if (e.type === "SENT" && e.messageId) {
      messageState.set(e.messageId, "SENT");
    }

    if (e.type === "DELIVERED" && e.messageId) {
      if (!messageState.has(e.messageId)) {
        violations.push({
          type: "ORPHAN_DELIVERY",
          messageId: e.messageId
        });
      }
    }
  }

  return { violations };
}

module.exports = { verifyIntegrity };
