const supabase = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * Control Plane Service (DFOS Brain)
 * Governs system policy, leases, and mode transitions.
 */
class ControlPlaneService {
    constructor() {
        this.policyCache = null;
        this.lastCacheFetch = 0;
        this.CACHE_TTL = 30000; 
    }

    /**
     * Get the current system policy (with fail-open caching)
     */
    async getPolicy() {
        if (this.policyCache && (Date.now() - this.lastCacheFetch < this.CACHE_TTL)) {
            return this.policyCache;
        }

        try {
            const { data, error } = await supabase
                .from('system_governance_policy')
                .select('*')
                .eq('key', 'GLOBAL_POLICY')
                .single();

            if (error) throw error;
            
            this.policyCache = data;
            this.lastCacheFetch = Date.now();
            return data;
        } catch (err) {
            logger.warn('[ControlPlane] Policy fetch failed. Falling back to local cache for HA.', err.message);
            if (this.policyCache) return this.policyCache;
            throw err;
        }
    }

    /**
     * Acquisition of an Absolute Fenced Lease for a shard.
     * Generates a NEW epoch_token that instantly invalidates old owners via DB trigger.
     */
    async acquireShardLease(shardId, workerId) {
        logger.info(`[ControlPlane] Worker ${workerId} acquiring Absolute Authority for Shard ${shardId}...`);
        
        const newEpochToken = require('crypto').randomUUID();

        const { data, error } = await supabase.rpc('acquire_shard_lease_absolute', {
            p_shard_id: shardId,
            p_worker_id: workerId,
            p_epoch_token: newEpochToken
        });

        if (error) {
            logger.error(`[ControlPlane] Lease acquisition failed for Shard ${shardId}:`, error.message);
            return null;
        }

        if (!data || data.length === 0) {
            logger.error(`[ControlPlane] Lease acquisition returned no data for Shard ${shardId}.`);
            return null;
        }

        logger.info(`[ControlPlane] Shard ${shardId} AUTHORITY SECURED. Epoch: ${newEpochToken}`);
        return { ...data[0], epoch_id: newEpochToken };
    }

    /**
     * Policy Transition with Dwell-Time Enforcement
     */
    async transitionMode(newMode, metadata = {}) {
        const policy = await this.getPolicy();
        
        // Rule: Prevent SAFE -> NORMAL flapping
        if (policy.mode === 'SAFE' && newMode === 'NORMAL') {
            const dwellLimit = policy.dwell_time_minutes || 30;
            const updated = new Date(policy.updated_at).getTime();
            const elapsed = (Date.now() - updated) / 60000;
            
            if (elapsed < dwellLimit) {
                throw new Error(`Dwell-time violation: System must stabilize in SAFE mode for ${dwellLimit} mins. Elapsed: ${Math.round(elapsed)} mins.`);
            }
        }

        const { error } = await supabase
            .from('system_governance_policy')
            .update({
                mode: newMode,
                updated_at: new Date().toISOString(),
                rules: { ...policy.rules, ...metadata },
                version: (policy.version || 0) + 1
            })
            .eq('key', 'GLOBAL_POLICY');

        if (error) throw error;
        logger.info(`[ControlPlane] SYSTEM MODE TRANSITION: ${policy.mode} -> ${newMode}`);
        this.policyCache = null; // Invalidate cache
    }
}

module.exports = new ControlPlaneService();
