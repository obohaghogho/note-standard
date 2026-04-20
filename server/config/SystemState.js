const logger = require('../utils/logger');

/**
 * SystemState - The Authoritative Global Kill-Switch
 * Implements strict Selective Safe Mode
 */
/**
 * SystemState - The Authoritative Global Governance Kernel
 * Implements Adaptive Containment and Self-Healing Recovery
 */
class SystemStateController {
    constructor() {
        this.mode = "NORMAL"; // NORMAL | SAFE | RECOVERY
        this.reason = null;
        this.frozenAssets = new Map(); // asset -> expiryTimestamp
        this.frozenEntities = new Map(); // entityId -> expiryTimestamp
        this.metrics = {
            queueLag: 0,
            growthRate: 0,
            drift: 0,
            hasDrift: false,
            priceHealth: 1.0, // 0.0 to 1.0
            lastUpdated: Date.now()
        };
        this.stableSince = Date.now();
        this.enterSafeTime = null; // Timestamp when SAFE mode was activated
        this.minSafeModeDuration = 120; // Hard dwell floor in seconds
        this.manualMode = false; // If true, auto-recovery is disabled
    }


    enterSafeMode(triggerReason) {
        if (this.mode !== "SAFE") {
            this.mode = "SAFE";
            this.reason = triggerReason || "Internal integrity breach.";
            this.stableSince = Date.now();
            this.enterSafeTime = Date.now();
            logger.error(`[SAFE_MODE_ACTIVATED] System locked. Trigger: ${this.reason}. Hard Dwell Floor: ${this.minSafeModeDuration}s`);
        }
    }


    transition(newMode, transitionReason) {
        if (newMode === "SAFE") return this.enterSafeMode(transitionReason);
        
        const oldMode = this.mode;
        this.mode = newMode;
        this.reason = transitionReason;
        this.stableSince = Date.now();
        
        logger.warn(`[SYSTEM_TRANSITION] ${oldMode} -> ${newMode}. Reason: ${transitionReason}`);
    }

    freezeAsset(symbol, durationSeconds = 60) {
        const expiry = Date.now() + (durationSeconds * 1000);
        this.frozenAssets.set(symbol.toUpperCase(), expiry);
        logger.warn(`[ASSET_FREEZE] ${symbol} frozen until ${new Date(expiry).toISOString()}`);
    }

    isAssetFrozen(symbol) {
        if (!symbol) return false;
        const expiry = this.frozenAssets.get(symbol.toUpperCase());
        if (!expiry) return false;
        if (Date.now() > expiry) {
            this.frozenAssets.delete(symbol.toUpperCase());
            return false;
        }
        return true;
    }

    /**
     * Entity-Scoped Safe Mode
     * Isolate a hot or compromised wallet without halting the platform.
     */
    freezeEntity(entityId, durationSeconds = 30) {
        const expiry = Date.now() + (durationSeconds * 1000);
        this.frozenEntities.set(entityId, expiry);
        logger.warn(`[ENTITY_FREEZE] ${entityId} isolated until ${new Date(expiry).toISOString()}`);
    }

    isEntityFrozen(entityId) {
        if (!entityId) return false;
        const expiry = this.frozenEntities.get(entityId);
        if (!expiry) return false;
        if (Date.now() > expiry) {
            this.frozenEntities.delete(entityId);
            return false;
        }
        return true;
    }


    isSafe() {
        return this.mode === "SAFE" || this.mode === "RECOVERY";
    }

    canExitSafeMode() {
        if (this.manualMode) return false;
        
        // 1. Temporal Dampening: 120s Hard Floor
        const dwellTime = this.enterSafeTime ? (Date.now() - this.enterSafeTime) / 1000 : 0;
        if (dwellTime < this.minSafeModeDuration) return false;

        // 2. Metric Stability Window (120s)
        const durationStable = (Date.now() - this.stableSince) / 1000;
        
        // 3. Health check with Epsilon
        const driftEpsilon = 1e-6;
        const isHealthy = this.metrics.queueLag < 30 && 
                         this.metrics.growthRate <= 0 && 
                         (!this.metrics.hasDrift || (this.metrics.drift < driftEpsilon)) &&
                         this.metrics.priceHealth > 0.8;

        return isHealthy && durationStable >= 120;
    }


    updateMetrics(newMetrics) {
        const prevLag = this.metrics.queueLag;
        const now = Date.now();
        const deltaTime = (now - this.metrics.lastUpdated) / 1000;

        // Calculate Growth Rate: (current - previous) / time
        if (deltaTime > 0) {
            this.metrics.growthRate = (newMetrics.queueLag - prevLag) / deltaTime;
        }

        this.metrics = {
            ...this.metrics,
            ...newMetrics,
            lastUpdated: now
        };

        // If anything triggers an un-stable event, reset stableSince
        const isUnstable = this.metrics.queueLag > 100 || 
                           this.metrics.growthRate > 2 || 
                           this.metrics.hasDrift;
                           
        if (isUnstable) {
            this.stableSince = now;
        }

        // Auto-Recovery Actuator
        if (this.mode === "SAFE" && this.canExitSafeMode()) {
            this.transition("RECOVERY", "STABILIZATION_WINDOW_ELAPSED");
        } else if (this.mode === "RECOVERY" && this.canExitSafeMode()) {
            // Full recovery once replay is assumed done or verified
        }
    }

    /**
     * Bounded Failure Handling: IRRECOVERABLE_STATE_CORRUPTION
     * Tactics: Freeze (Infinity), Halt Replay, Forensic Snapshot, Manual Queue
     */
    async handleIrrecoverableCorruption(walletId, rootCausalId, evidence) {
        logger.error(`[CRITICAL_CORRUPTION] ${walletId} / root: ${rootCausalId}. IRRECOVERABLE. Isolating.`);

        // 1. Freeze Entity (Infinity / 100 years)
        const eternity = 100 * 365 * 24 * 60 * 60; 
        this.freezeEntity(walletId, eternity);

        // 2. Halt Replay (Handled by checking blacklist in Worker)
        this.blacklistCausalRoot(rootCausalId);

        // 3. Emit Forensic Event
        logger.warn(`[FORENSIC_SNAPSHOT] Corruption Context:`, { walletId, rootCausalId, evidence });

        // 4. Dispatch to Manual Reconciliation Queue
        const supabase = require('./database');
        await supabase.from('manual_reconciliation_queue').insert({
            wallet_id: walletId,
            corruption_root_causal_id: rootCausalId,
            evidence: evidence,
            status: 'pending'
        });
    }

    blacklistCausalRoot(rootId) {
        if (!this.blacklistedRoots) this.blacklistedRoots = new Set();
        this.blacklistedRoots.add(rootId);
    }

    isRootBlacklisted(rootId) {
        return this.blacklistedRoots?.has(rootId);
    }


    getStatusData() {
        return {
            mode: this.mode,
            reason: this.reason,
            metrics: this.metrics,
            stable_for: Math.round((Date.now() - this.stableSince) / 1000),
            frozen_assets: Array.from(this.frozenAssets.keys()),
            allowed_operations: this.mode === "NORMAL" ? ["ALL"] : ["READ_ONLY", "AUTH", "RECOVERY_INGESTION"],
            blocked_operations: this.mode === "SAFE" ? ["ALL_MUTATIONS"] : (this.mode === "RECOVERY" ? ["THROTTLED_MUTATIONS"] : [])
        };
    }
}

const SystemState = new SystemStateController();
module.exports = SystemState;
