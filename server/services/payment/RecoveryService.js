const supabase = require('../config/database');
const logger = require('../utils/logger');
const math = require('../../utils/math');

/**
 * Recovery Service (Architect's Deterministic Replay Engine)
 * Reconstructs state from the event log and Resolves discrepancies.
 */
class RecoveryService {
    
    /**
     * Deterministic Rebuild: 
     * Recomputes an entity's state by replaying every event in its causal chain.
     */
    async rebuildEntityState(entityId, entityScope) {
        logger.info(`[RecoveryService] Replaying causal chain for ${entityScope}:${entityId}...`);
        
        const { data: events, error } = await supabase
            .from('financial_event_log')
            .select('*')
            .eq('entity_id', entityId)
            .order('sequence_id', { ascending: true });

        if (error) throw error;

        let computedState = {};
        let currentVersion = 1;

        // DETERMINISTIC RULES: No floating point math, no external calls, strict ordering.
        for (const event of events) {
            const { to, updates } = event.payload;
            
            // Re-apply state transitions
            computedState.withdrawal_state = to;
            computedState = { ...computedState, ...updates };
            currentVersion++;
            
            logger.debug(`[RecoveryService] Applied Event Seq:${event.sequence_id} -> New State: ${to}`);
        }

        return { computedState, currentVersion };
    }

    /**
     * Validate and Resolve Drift:
     * Compares live DB state vs Recomputed state and applies corrections.
     */
    async resolveEntityDrift(entityId, entityScope) {
        const { computedState, currentVersion } = await this.rebuildEntityState(entityId, entityScope);
        
        let liveState;
        if (entityScope === 'payout_request') {
            const { data } = await supabase.from('payout_requests').select('*').eq('id', entityId).single();
            liveState = data;
        }

        if (!liveState) throw new Error('Live state not found for drift resolution');

        // Check for Drifts
        const drifts = [];
        if (liveState.withdrawal_state !== computedState.withdrawal_state) drifts.push('state_mismatch');
        if (liveState.state_version !== currentVersion - 1) drifts.push('version_mismatch');

        if (drifts.length > 0) {
            logger.warn(`[RecoveryService] DRIFT DETECTED for ${entityId}: ${drifts.join(', ')}`);
            
            // COMPENSATION RULE ENGINE:
            // 1. Never delete history.
            // 2. Apply compensating ledger entry if balances are affected.
            // 3. Force-sync payout state to the computed 'truth' from the log.
            
            const { error: syncErr } = await supabase
                .from('payout_requests')
                .update({
                    withdrawal_state: computedState.withdrawal_state,
                    state_version: currentVersion, // Re-aligning version to event chain
                    metadata: { ...liveState.metadata, recovery_applied: true, recovery_reason: drifts }
                })
                .eq('id', entityId);

            if (syncErr) throw syncErr;
            
            logger.info(`[RecoveryService] DETERMINISTIC RECOVERY APPLIED for ${entityId}. State re-aligned to event log.`);
            return { recovered: true, drifts };
        }

        return { recovered: false };
    }
}

module.exports = new RecoveryService();
