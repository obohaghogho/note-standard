const math = require("../utils/mathUtils");
const logger = require("../utils/logger");

/**
 * DFOS v6.0 Decision Engine
 * Enforces atomic evaluation: (Snapshot + Confidence + RiskPolicy) -> ExecutionState
 */
class DecisionEngine {
  constructor() {
    this.DEFAULT_POLICY = {
      max_slippage_bps: 100,
      min_confidence_score: 0.70,
      max_age_ms: 120000,
      volatility_drift_limit: 0.05,
      // Threshold Bands (v6.0 Refined)
      drift_threshold_low: 0.0015,   // 0.15% (Log)
      drift_threshold_med: 0.0075,   // 0.75% (Degrade)
      drift_threshold_high: 0.015    // 1.5% (Hard Block Asset)
    };
  }

  /**
   * Deterministic Evaluation Logic
   * MUST be pure and reproducible.
   */
  evaluate(snapshot, walletId = null, legacyRates = null, customPolicy = null) {
    const policy = customPolicy || this.DEFAULT_POLICY;
    const now = Date.now();
    const snapshotAge = now - new Date(snapshot.created_at).getTime();
    const frozenAssets = [];
    let state = "ALLOWED";
    let reason = "CONSENSUS_STABLE";
    let adjustedScore = snapshot.confidence_score;
    
    // 1. Snapshot Integrity Guards
    if (!snapshot || !snapshot.rates || !snapshot.checksum) {
      return { state: "HARD_BLOCK", reason: "INVALID_SNAPSHOT", score: 0, frozenAssets: ["*"] };
    }

    // 1.1 Checksum Verification (DFOS v6.0 Immutable Truth)
    const crypto = require("crypto");
    const sortedRates = Object.keys(snapshot.rates).sort().reduce((obj, key) => {
      obj[key] = snapshot.rates[key];
      return obj;
    }, {});
    const actualChecksum = crypto.createHash("sha256").update(JSON.stringify(sortedRates)).digest("hex");
    
    if (actualChecksum !== snapshot.checksum) {
       logger.error(`[DecisionEngine] Snapshot ${snapshot.id} Integrity Failure!`);
       return { state: "HARD_BLOCK", reason: "INTEGRITY_FAILURE", score: 0, frozenAssets: ["*"] };
    }

    // 2. Temporal Guard
    if (snapshotAge > policy.max_age_ms) {
       return { state: "HARD_BLOCK", reason: "SNAPSHOT_EXPIRED", score: snapshot.confidence_score, frozenAssets: ["*"] };
    }

    let maxDrift = 0;
    
    // 3. Authority Resolution & Drift Mismatch (Canary Kernel)
    if (legacyRates) {
      for (const asset in snapshot.rates) {
        const sRate = snapshot.rates[asset];
        const lRate = legacyRates[asset];
        if (lRate && sRate > 0) {
          const delta = Math.abs(sRate - lRate) / lRate;
          maxDrift = Math.max(maxDrift, delta);
          
          if (delta > policy.drift_threshold_high) {
            frozenAssets.push(asset);
            state = "SOFT_WARN"; // Wallet is warn, Asset is frozen
            reason = "DOMAIN_FREEZE_ACTIVE";
          } else if (delta > policy.drift_threshold_med) {
            adjustedScore *= 0.8; // 20% Confidence Penalty
            state = "SOFT_WARN";
            reason = "MEDIUM_MISMATCH_DEGRADATION";
          }
        }
      }
    }

    // 4. Confidence Threshold Guard
    if (adjustedScore < policy.min_confidence_score) {
       if (adjustedScore > 0.4) {
         state = "SOFT_WARN";
         reason = "LOW_CONFIDENCE";
       } else {
         return { state: "HARD_BLOCK", reason: "UNRELIABLE_DATA", score: adjustedScore, frozenAssets: ["*"], maxDrift };
       }
    }

    // 6. Adaptive Reality Anchor (Phase 5 - Gated Expansion)
    const pcsScore = snapshot.source_metadata?.pcsScore || 0;
    const timeIntegrity = snapshot.source_metadata?.timeIntegrityScore || 1.0;
    
    // Multi-Axis Gate for expansion
    const canExpand = pcsScore < 0.2 && timeIntegrity > 0.9 && snapshot.confidence_score > 0.95;
    
    if (maxDrift > policy.drift_threshold_high) {
       if (canExpand) {
           // Allow rate-limited expansion (5% max step, 35% absolute)
           const allowedStep = Math.min(maxDrift, 0.05); 
           state = "SOFT_WARN";
           decisionReason = `ADAPTIVE_ANCHOR_EXPANDING_${(allowedStep * 100).toFixed(0)}P`;
       } else {
           state = "HARD_BLOCK";
           reason = "REALITY_ANCHOR_BREACH_STATIC";
       }
    }

    // 5. Global Volatility Guard
    const volatility = snapshot.source_metadata?.velocityScore || 1.0;
    if (volatility < 0.5) {
       state = "SOFT_WARN";
       reason = "HIGH_VOLATILITY";
    }

    return { 
      state, 
      reason: decisionReason || reason, 
      score: parseFloat(adjustedScore.toFixed(4)),
      frozenAssets,
      policy_id: "v6.x_truth_resilient",
      maxDrift,
      timeIntegrity
    };
  }

  /**
   * Generates a unique identifier for this specific decision.
   */
  getDecisionHash(walletId, snapshotId, state) {
    const crypto = require("crypto");
    const data = `${walletId}:${snapshotId}:${state}`;
    return crypto.createHash("sha1").update(data).digest("hex");
  }
}

module.exports = new DecisionEngine();
