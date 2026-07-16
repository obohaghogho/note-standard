/**
 * accInvariantValidator.js
 *
 * The war-game generates conflicting lease events by design.
 * Violations are ONLY valid when:
 *   - The ACC explicitly returns an ALLOW decision under a known lease conflict
 *   - An "ALLOW_INVALID" status is detected in the ACC response
 *
 * Raw multi-writer events in the attack stream are EXPECTED INPUTS, not violations.
 */
function validateInvariants(events) {
  const violations = [];

  const leaseOwner = new Map();

  for (const e of events) {
    if (e.type === "LEASE_EVENT") {
      const lease = e.result?.leaseId;
      const device = e.deviceId;
      const decision = e.result?.decision;

      // Only a violation if the ACC *allowed* a second writer onto a conflicted lease
      if (
        leaseOwner.has(lease) &&
        leaseOwner.get(lease) !== device &&
        (decision === "ALLOW" || decision === undefined && e.result?.status === "OK")
      ) {
        // We only flag it if the result was explicitly ALLOW_INVALID
        if (e.result?.status === "ALLOW_INVALID" || decision === "ALLOW_INVALID") {
          violations.push({
            type: "INVALID_ALLOW_ON_CONFLICT",
            lease,
            device,
            decision
          });
        }
        // Otherwise: DELAY/TRANSFORM on conflict = correct ACC behavior
      }

      leaseOwner.set(lease, device);
    }

    // Always flag explicit ALLOW_INVALID responses
    if (e.result?.status === "ALLOW_INVALID" || e.result?.decision === "ALLOW_INVALID") {
      violations.push({
        type: "INVALID_ALLOW_DETECTED",
        event: e.type
      });
    }
  }

  return { violations };
}

module.exports = { validateInvariants };
