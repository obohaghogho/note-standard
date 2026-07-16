const CHAOS_THRESHOLDS = {
  // Phase 6.3 (Messaging Chaos)
  level: 2,
  maxAnomalies: 0,
  maxLeaseConflicts: 5,
  maxQueueFailures: 2,

  // Phase 8.2 (ACC Chaos Lab)
  acc: {
    maxViolations: 0,           // ZERO tolerance on MULTI_WRITER or INVALID_ALLOW
    maxP95LatencyMs: 5,         // 5ms hard ceiling
    maxShadowMutations: 0       // Shadow mode must be read-only
  },

  strictModes: {
    blockOnAnyLeaseViolation: true,
    blockOnDuplicateSentEvent: true,
    blockOnReplayMismatch: true,
    blockOnCertificationFailure: true   // Phase 8.3: certify every run
  }
};

module.exports = { CHAOS_THRESHOLDS };
