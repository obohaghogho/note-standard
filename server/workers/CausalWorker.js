const supabase = require('../config/database');
const logger = require('../utils/logger');
const controlPlane = require('../services/payment/ControlPlaneService');
const stateMachine = require('../services/payment/StateMachineKernel');
const SystemState = require('../config/SystemState');
const realtime = require('../services/realtimeService');

/**
 * Causal Worker (Fenced Execution)
 * Processes the causal_execution_queue for a specific shard.
 */
class CausalWorker {
    constructor(workerId, shardId) {
        this.workerId = workerId;
        this.shardId = shardId;
        this.lease = null;
        this.isRunning = false;
        this.HEARTBEAT_INTERVAL = 10000; // 10 seconds
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        logger.info(`[CausalWorker] Shard ${this.shardId} starting for Worker ${this.workerId}...`);
        
        // 1. Acquire Initial Lease
        this.lease = await controlPlane.acquireShardLease(this.shardId, this.workerId);
        if (!this.lease) {
            logger.error(`[CausalWorker] Could not acquire lease for Shard ${this.shardId}. Worker terminating.`);
            return;
        }

        // 2. Start Heartbeat
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.HEARTBEAT_INTERVAL);

        // 3. Execution Loop
        while (this.isRunning) {
            try {
                await this.processNextBatch();
                await new Promise(r => setTimeout(r, 1000)); // Tick rate
            } catch (err) {
                logger.error(`[CausalWorker] Error in Shard ${this.shardId} loop:`, err.message);
            }
        }
    }

    async sendHeartbeat() {
        if (!this.lease) return;
        
        const { error } = await supabase
            .from('system_shard_leases')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('shard_id', this.shardId);

        if (error) {
            logger.error(`[CausalWorker] Heartbeat failed for Shard ${this.shardId}. Stopping.`);
            this.stop();
        }
    }

    async stop() {
        this.isRunning = false;
        clearInterval(this.heartbeatTimer);
        logger.info(`[CausalWorker] Shard ${this.shardId} stopped.`);
    }

    async processNextBatch() {
        // 1. Governance Guard: Absolute Mutation Freeze
        if (SystemState.mode === 'SAFE') {
            logger.warn(`[CausalWorker] Shard ${this.shardId} execution HALTED: System in SAFE_MODE.`);
            return;
        }

        // 2. Fetch Pending Intents for this shard
        const { data: intents, error } = await supabase
            .from('causal_execution_queue')
            .select('*')
            .eq('shard_id', this.shardId)
            .eq('status', 'pending')
            .order('sequence_id', { ascending: true })
            .limit(10);

        if (error) {
            logger.error(`[CausalWorker] Shard ${this.shardId} fetch error:`, error.message);
            return;
        }
        
        if (!intents || intents.length === 0) {
            logger.info(`[CausalWorker] Shard ${this.shardId} no pending intents.`);
            return;
        }

        logger.info(`[CausalWorker] Shard ${this.shardId} found ${intents.length} intents.`);

        for (const intent of intents) {
            await this.executeIntent(intent);
        }
    }

    async executeIntent(intent) {
        logger.info(`[CausalWorker] Shard ${this.shardId} processing Seq:${intent.sequence_id} (${intent.intent_type})`);
        
        try {
            // Dual-Layer Validation (Internal FSM check)
            if (intent.intent_type === 'payout_transition') {
                const { from, to } = intent.payload;
                stateMachine.validateTransition('payout_request', from, to);
            }

            // 3. ATOMIC FENCED COMMIT
            // We write to financial_event_log. 
            // The DB trigger 'trg_fenced_commit' will verify epoch_token.
            const { error: commitError } = await supabase
                .from('financial_event_log')
                .insert({
                    entity_id: intent.entity_id || intent.wallet_id,
                    entity_scope: intent.entity_scope || 'payout_request',
                    event_type: intent.intent_type,
                    expected_version: intent.expected_version,
                    intent_id: intent.sequence_id,
                    causal_group_id: intent.payload?.causal_group_id,
                    payload: intent.payload,
                    epoch_token: this.lease?.epoch_id, // Absolute Fencing Token
                });

            if (commitError) {
                // FENCING_ERROR Handling: If we lose authority mid-flight, we must refresh immediately.
                if (commitError.message.includes('FENCING_ERROR')) {
                    logger.warn(`[CausalWorker] Shard ${this.shardId} caught FENCING_ERROR. Reacquiring lease...`);
                    this.lease = await controlPlane.acquireShardLease(this.shardId, this.workerId);
                    // Re-throw to allow retry in next loop
                }
                throw commitError;
            }

            // 4. Mark Intent Completed
            await supabase
                .from('causal_execution_queue')
                .update({ 
                    status: 'completed', 
                    processed_at: new Date().toISOString() 
                })
                .eq('sequence_id', intent.sequence_id);

            // 5. Instantly Sync Materialized Balance (Fixes UI Staleness)
            const walletToSync = intent.entity_id || intent.wallet_id;
            if (walletToSync) {
                await supabase.rpc('sync_wallet_balance_from_ledger', { p_wallet_id: walletToSync });
                
                // 6. Proactive Real-time Push
                // Find the user_id for this wallet to notify them
                const { data: w } = await supabase.from('wallets_store').select('user_id, currency, balance').eq('id', walletToSync).single();
                if (w) {
                    await realtime.emitToUser(w.user_id, 'balance_updated', {
                        userId: w.user_id,
                        walletId: walletToSync,
                        currency: w.currency,
                        balance: w.balance,
                        status: 'COMPLETED'
                    });
                }
            }

            logger.info(`[CausalWorker] Shard ${this.shardId} SUCCESS: Intent Seq:${intent.sequence_id} committed and synced.`);

        } catch (err) {
            const isFencingError = err.message.includes('FENCING_ERROR');
            
            if (isFencingError) {
                logger.warn(`[CausalWorker] Shard ${this.shardId} STOPPED processing Seq:${intent.sequence_id} due to FENCING_ERROR. Intent remains pending.`);
                throw err; // Re-throw to stop batch and avoid marking as failed
            }

            logger.error(`[CausalWorker] Shard ${this.shardId} FAILURE for Intent Seq:${intent.sequence_id}:`, err.message);
            
            await supabase
                .from('causal_execution_queue')
                .update({ 
                    status: 'failed', 
                    error_log: err.message 
                })
                .eq('sequence_id', intent.sequence_id);
        }
    }
}

module.exports = CausalWorker;
