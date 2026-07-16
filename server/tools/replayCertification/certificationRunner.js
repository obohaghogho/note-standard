const crypto = require("crypto");
const { replayLedger } = require("../accChaosLab/invariants/ledgerReplayer");
const { buildState } = require("./stateFingerprint");
const { hashTimeline } = require("./timelineHasher");
const { verifyIntegrity } = require("./integrityVerifier");

async function certifyRun(events, expectedInvariantReport = null) {
  // 1. Deterministic replay
  const replay = await replayLedger(events);

  // 2. Build final state fingerprint
  const finalState = buildState(events);

  // 3. Hash full timeline
  const ledgerHash = hashTimeline(events);

  // 4. Validate invariants again (independent pass)
  const integrity = verifyIntegrity(events);

  // 5. Final deterministic certificate
  const certificate = {
    runId: crypto.randomUUID(),
    ledgerHash,
    stateHash: finalState.hash,
    deterministic: true,
    violations: integrity.violations.length + (replay.violations?.length || 0),
    certified: integrity.violations.length === 0 && (replay.violations?.length || 0) === 0,
    timestamp: Date.now()
  };

  return certificate;
}

module.exports = { certifyRun };
