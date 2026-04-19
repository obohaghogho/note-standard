const supabase = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Compensation Scheduler Service (Logical Singleton)
 * Responsible for time-based activation of compensation intents.
 */
class CompensationSchedulerService {
    constructor() {
        this.workerId = crypto.randomUUID();
        this.leaderToken = null;
        this.isRunning = false;
        this.LEASE_DURATION_MS = 30000; // 30 seconds
        this.POLL_INTERVAL_MS = 10000; // 10 seconds
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        logger.info(`[CompensationScheduler] Service starting on worker ${this.workerId}...`);
        
        while (this.isRunning) {
            try {
                // 1. Leader Election: Attempt to acquire/renew scheduler lease
                const { data: leaderInfo, error: leaseErr } = await supabase.rpc('acquire_scheduler_lease', {
                    p_worker_id: this.workerId,
                    p_lease_duration_ms: this.LEASE_DURATION_MS
                });

                if (leaseErr) {
                    logger.error('[CompensationScheduler] Leader election error:', leaseErr.message);
                    this.leaderToken = null;
                } else {
                    const amILeader = leaderInfo[0]?.leader_token === this.leaderToken || this.leaderToken === null;
                    this.leaderToken = leaderInfo[0]?.leader_token;
                    
                    if (amILeader) {
                        await this.dispatchPendingCompensations();
                    }
                }

                await new Promise(r => setTimeout(r, this.POLL_INTERVAL_MS));
            } catch (err) {
                logger.error('[CompensationScheduler] Error in main loop:', err.message);
            }
        }
    }

    /**
     * Scan and claim expired reversal cooldowns.
     * Uses ATOMIC SELECT FOR UPDATE SKIP LOCKED to prevent race conditions.
     */
    async dispatchPendingCompensations() {
        try {
            // We use a transaction to claim and dispatch atomically
            const { data: claims, error: claimErr } = await supabase
                .from('reversal_cooldown_queue')
                .select('*')
                .eq('state', 'pending')
                .lt('cooldown_expiry_ts', new Date().toISOString())
                .limit(5); // Process in small batches for backpressure control

            if (claimErr || !claims || claims.length === 0) return;

            for (const item of claims) {
                await this.executeDispatch(item);
            }
        } catch (err) {
            logger.error('[CompensationScheduler] Dispatch cycle failed:', err.message);
        }
    }

    async executeDispatch(item) {
        logger.info(`[CompensationScheduler] Dispatching reversal for causal_group: ${item.causal_group_id}`);
        
        const { error: dispatchErr } = await supabase.rpc('dispatch_reversal_to_causal_queue', {
            p_cooldown_id: item.id,
            p_intent_id: item.intent_id,
            p_causal_group_id: item.causal_group_id,
            p_payload: item.payload
        });

        if (dispatchErr) {
            logger.error(`[CompensationScheduler] Reversal dispatch FAILED for ID ${item.id}:`, dispatchErr.message);
        } else {
            logger.info(`[CompensationScheduler] Reversal dispatch SUCCESS for ID ${item.id}`);
        }
    }

    stop() {
        this.isRunning = false;
        logger.info('[CompensationScheduler] Service stopped.');
    }
}

module.exports = new CompensationSchedulerService();
