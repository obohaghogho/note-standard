const crypto = require("crypto");
const logger = require("../../utils/logger");

/**
 * Epistemic Manager (Phase 5)
 * Manages the "Belief System under Uncertainty".
 */
class EpistemicManager {
    constructor() {
        this.exitStateMap = new Map(); // (asset:epochBucket) -> counter
        this.currentStates = new Map(); // asset -> state (STABLE, UNCERTAIN)
        this.stateEntranceTimes = new Map(); // asset -> timestamp

        this.ENTRANCE_THRESHOLD = 0.5; // Confidence below this -> UNCERTAIN
        this.EXIT_THRESHOLD = 0.7;     // Confidence above this -> Attempt recovery
        this.STABILIZATION_CYCLES = 12; // 12 snapshots (1 minute)
        this.MIN_DWELL_TIME_MS = 30000; // 30 seconds minimum in state
    }

    /**
     * Updates the epistemic state of an asset based on current confidence.
     */
    evaluateState(asset, confidence, signals = {}) {
        const now = Date.now();
        const currentState = this.currentStates.get(asset) || 'STABLE';
        const entranceTime = this.stateEntranceTimes.get(asset) || 0;
        
        let newState = currentState;

        // 1. Entrance Logic (EPISTEMIC_UNCERTAINTY)
        const isSuspicious = signals.isSuspicious || signals.timeIntegrityScore < 0.6;
        if (currentState === 'STABLE' && (confidence < this.ENTRANCE_THRESHOLD || isSuspicious)) {
            newState = 'EPISTEMIC_UNCERTAINTY';
            this.stateEntranceTimes.set(asset, now);
            logger.error(`[Epistemic] Entering EPISTEMIC_UNCERTAINTY for ${asset}. (Confidence: ${confidence.toFixed(2)})`);
        }

        // 2. Exit Logic (Hysteresis Gate)
        if (currentState === 'EPISTEMIC_UNCERTAINTY') {
            const dwellTime = now - entranceTime;
            const recoveryPossible = confidence > this.EXIT_THRESHOLD && !isSuspicious;
            
            if (recoveryPossible && dwellTime >= this.MIN_DWELL_TIME_MS) {
                const exitCount = this._incrementExitCounter(asset);
                if (exitCount >= this.STABILIZATION_CYCLES) {
                    newState = 'STABLE';
                    logger.info(`[Epistemic] Recovered STABLE for ${asset} after ${exitCount} cycles.`);
                    this._clearExitCounter(asset);
                }
            } else {
                // Any instability resets the recovery counter
                this._clearExitCounter(asset);
            }
        }

        this.currentStates.set(asset, newState);
        return {
            state: newState,
            exitCounter: this._getExitCounter(asset),
            dwellTimeSec: Math.floor((now - entranceTime) / 1000)
        };
    }

    /**
     * Scoped Exit Counter (Memory + Replay Fallback logic)
     * User Constraint: Scope to (asset_pair + snapshot_epoch_bucket)
     */
    _incrementExitCounter(asset) {
        const epochBucket = Math.floor(Date.now() / 5000);
        const key = `${asset}:${epochBucket}`;
        const count = (this.exitStateMap.get(key) || 0) + 1;
        this.exitStateMap.set(key, count);
        
        // Clean up old buckets
        if (this.exitStateMap.size > 100) {
            const firstKey = this.exitStateMap.keys().next().value;
            this.exitStateMap.delete(firstKey);
        }

        return count;
    }

    _getExitCounter(asset) {
        const epochBucket = Math.floor(Date.now() / 5000);
        return this.exitStateMap.get(`${asset}:${epochBucket}`) || 0;
    }

    _clearExitCounter(asset) {
        const epochBucket = Math.floor(Date.now() / 5000);
        this.exitStateMap.delete(`${asset}:${epochBucket}`);
    }
}

module.exports = new EpistemicManager();
