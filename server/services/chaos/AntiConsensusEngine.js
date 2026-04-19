const logger = require("../../utils/logger");

/**
 * Anti-Consensus Engine (Phase 5)
 * Detects "Normal-looking fake markets" and intentional drift manipulation.
 */
class AntiConsensusEngine {
    constructor() {
        this.FRICTION_WINDOW_SIZE = 12; // 1 minute of snapshots (5s each)
        this.driftFrictionHistory = new Map();
    }

    /**
     * Calculates the Drift Friction metric for an asset.
     * driftFriction = direction_changes / total_movements
     */
    calculateDriftFriction(asset, currentDriftBps) {
        let history = this.driftFrictionHistory.get(asset) || [];
        
        // Push current direction (-1, 0, 1)
        const direction = currentDriftBps > 0 ? 1 : (currentDriftBps < 0 ? -1 : 0);
        history.push(direction);
        if (history.length > this.FRICTION_WINDOW_SIZE) history.shift();
        
        this.driftFrictionHistory.set(asset, history);

        let changes = 0;
        let movements = 0;
        for (let i = 1; i < history.length; i++) {
            if (history[i] !== 0) movements++;
            if (history[i] !== history[i-1] && history[i-1] !== 0) {
                changes++;
            }
        }

        const friction = movements > 0 ? (changes / movements) : 1.0;
        return parseFloat(friction.toFixed(4));
    }

    /**
     * Microstructure Inconsistency Filter.
     * Compares Implied Volatility (Price delta) vs Observed Volatility (Heartbeat tick frequency).
     */
    checkMicrostructureConsistency(impliedVolBps, observedTickRate) {
        // High Tick Rate + High Vol = Natural
        // Low Tick Rate + High Vol = SUSPICIOUS (Oracle Jump?)
        // High Tick Rate + Zero Vol = SUSPICIOUS (Echo Chamber?)
        
        let inconsistencyScore = 0;
        
        if (impliedVolBps > 50 && observedTickRate < 2) {
            inconsistencyScore = 0.8; // High movement on dead heartbeat
        } else if (impliedVolBps < 5 && observedTickRate > 20) {
            inconsistencyScore = 0.4; // Excessive chatter on zero movement (Potential signal padding)
        }

        return inconsistencyScore;
    }

    /**
     * Consensus Suspicion Trigger (User Phase 5 Invariant)
     */
    isConsensusSuspicious(entropy, inconsistencyScore, driftFriction) {
        // Attack scenario: entropy near zero (perfect agreement) 
        // AND (inconsistency high OR friction too low)
        const isPerfectAlignment = entropy < 0.001;
        const reflectsManipulation = inconsistencyScore > 0.6 || driftFriction < 0.1;

        if (isPerfectAlignment && reflectsManipulation) {
            logger.warn(`[ACE] SUSPICIOUS_CONSENSUS DETECTED: Perfect alignment on abnormal microstructure.`);
            return true;
        }

        return false;
    }
}

module.exports = new AntiConsensusEngine();
