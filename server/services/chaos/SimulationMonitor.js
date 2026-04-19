const logger = require("../../utils/logger");

/**
 * Simulation Monitor (DFOS v6.0 Phase 4)
 * Outcome Classification and Relational Behavioral Metrics.
 */
class SimulationMonitor {
    /**
     * Labels the outcome of a shadow arbitration run.
     * @param {Object} injectedMeta - The parameters injected
     * @param {Object} shadowSnapshot - The output from SnapshotService
     * @param {Object} decision - The output from DecisionEngine
     */
    classifyOutcome(injectedMeta, shadowSnapshot, decision) {
        const hasDrift = injectedMeta.driftBps > 10; // > 0.1% baseline
        const isFrozen = decision.frozenAssets.length > 0 || decision.state === 'BLOCKED';
        
        // 1. False Stability Check (Most Dangerous)
        if (hasDrift && !isFrozen && decision.state === 'ALLOWED') {
            return "STABLE_INCORRECT"; // Systems appears healthy but is wrong
        }

        // 2. Visible Instability
        if (isFrozen) {
            return "UNSTABLE_VISIBLE";
        }

        // 3. Recovery Detection (Phase 4 New State)
        if (injectedMeta.driftBps < 5 && shadowSnapshot.confidence_score > 0.85) {
            return "RECOVERED_WITH_DRIFT"; // Recovered but check residual drift
        }

        // 4. Stable Correct
        if (!hasDrift && shadowSnapshot.confidence_score > 0.9) {
            return "STABLE_CORRECT";
        }

        return "UNSTABLE_SUPPRESSED";
    }

    /**
     * Calculates Relational Metrics (User Phase 4 Metrics)
     */
    calculateRelationalMetrics(injectedMeta, shadowSnapshot, decision, history = []) {
        // Healing-to-Drift Ratio
        const driftMagnitude = injectedMeta.driftBps / 10000;
        const confidenceResponsiveness = shadowSnapshot.confidence_score / (1 + driftMagnitude);

        // Entropy Gradient (Simplified: Variance of source weights)
        const weights = Object.values(shadowSnapshot.source_metadata.sourceTrace).map(t => t.consensus);
        const meanWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
        const entropy = weights.reduce((acc, w) => acc + Math.pow(w - meanWeight, 2), 0) / weights.length;

        // Recovery Time Constant (Mocked based on desync tier for this single run)
        const recoveryConstantMap = { MICRO: 1, MESO: 5, MACRO: 15, EXTREME: 60 };
        const recoveryTime = recoveryConstantMap[injectedMeta.desyncTier] || 1;

        return {
            healingToDriftRatio: driftMagnitude > 0 ? (1 - shadowSnapshot.confidence_score) / driftMagnitude : 0,
            confidenceResponsiveness: parseFloat(confidenceResponsiveness.toFixed(4)),
            entropyGradient: parseFloat(entropy.toFixed(4)),
            recoveryTimeConstantS: recoveryTime
        };
    }
}

module.exports = new SimulationMonitor();
