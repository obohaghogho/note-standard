const supabase = require("../config/database");
const ledgerService = require("./LedgerService");
const calendar = require("../utils/SettlementCalendar");
const logger = require("../utils/logger");
const crypto = require("crypto");

/**
 * Settlement Engine (DFOS v6.x)
 * 
 * The sovereign finalizer responsible for bridging external provider signals 
 * to internal financial truth. Implements monotonic state transitions, 
 * authoritative temporal guards, and symmetric reversals.
 */
class SettlementEngine {
    constructor() {
        this.STATE_RANK = {
            'INITIATED': 1,
            'PROVIDER_SOFT': 2,
            'PROVIDER_HARD': 3,
            'LEDGER_COMMITTED': 4,
            'FAILED': 5,
            'COMPENSATED': 6
        };
    }

    /**
     * Primary entry point for processing provider events.
     */
    async processEvent(params) {
        const { 
            transactionId, 
            idempotencyKey, 
            status, 
            providerId, 
            payload, 
            eventAt 
        } = params;

        const ingestedAt = new Date().toISOString();
        const payloadHash = this.computePayloadHash(payload);

        logger.info(`[SettlementEngine] Processing event for Tx:${transactionId} Status:${status}`);

        try {
            // STEP 1: Entry Guard (Terminal NO-OP)
            // Instant exit for already committed transactions to protect throughput.
            const { data: tx, error: fetchErr } = await supabase
                .from('ledger_transactions_v6')
                .select('*')
                .eq('id', transactionId)
                .single();

            if (fetchErr) throw new Error(`TX_NOT_FOUND: ${transactionId}`);

            if (tx.execution_status === 'LEDGER_COMMITTED') {
                return { success: true, noop: true, reason: 'ALREADY_COMMITTED' };
            }

            // STEP 2: StateTransitionGuard (Pre-Lock)
            // Monotonicity + Provider Lock + System-Time sequencing.
            this.validateTransitionPreLock(tx, status, providerId, ingestedAt);

            // STEP 3: Idempotency & Payload Hash
            // Strong validation to prevent poisoned retries.
            this.validateIdempotency(tx, idempotencyKey, payloadHash, status);

            // STEP 4: Sovereign Transaction Boundary (Atomic Finalizer)
            return await this.executeAtomicTransition({
                tx,
                targetStatus: status,
                providerId,
                payloadHash,
                eventAt,
                ingestedAt,
                payload
            });

        } catch (err) {
            logger.error(`[SettlementEngine] Event processing failed: ${err.message}`);
            throw err;
        }
    }

    /**
     * Step 4: Atomic Execution Boundary
     */
    async executeAtomicTransition(ctx) {
        const { tx, targetStatus, providerId, payloadHash, eventAt, ingestedAt, payload } = ctx;

        // Perform transactional work inside a single RPC or client-side transaction
        // We use an RPC 'finalize_settlement_v6' to ensure the FOR UPDATE lock and logic are atomic.
        const { data, error } = await supabase.rpc('finalize_settlement_v6', {
            p_transaction_id: tx.id,
            p_target_status: targetStatus,
            p_provider_id: providerId,
            p_payload_hash: payloadHash,
            p_provider_event_at: eventAt,
            p_ingested_at: ingestedAt,
            p_confidence: this.calculateConfidence(tx, targetStatus, payload)
        });

        if (error) {
            throw new Error(`ATOMIC_SETTLEMENT_FAILURE: ${error.message}`);
        }

        return data;
    }

    /**
     * Step 4 Sub-process: Finality Calculation
     */
    calculateConfidence(tx, status, payload) {
        // Only LEDGER_COMMITTED and PROVIDER_HARD should compute active confidence
        if (status === 'INITIATED') return 0;
        
        const type = tx.type; // e.g. 'DEPOSIT', 'WITHDRAWAL'
        
        if (payload.confirmations !== undefined) {
            // Crypto Logic
            return calendar.getCryptoConfidence(payload.confirmations);
        }

        // Default Fiat Logic (fallback)
        return calendar.getFiatConfidence(tx.created_at);
    }

    /**
     * Compute SHA-256 hash of event payload for idempotency.
     */
    computePayloadHash(payload) {
        return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    }

    /**
     * Validates monotonicity and source integrity before locking.
     */
    validateTransitionPreLock(tx, status, providerId, ingestedAt) {
        const currentRank = this.STATE_RANK[tx.execution_status] || 0;
        const targetRank = this.STATE_RANK[status];

        // 1. Monotonicity
        if (targetRank < currentRank) {
            throw new Error(`STATE_REGRESSION: Cannot move from ${tx.execution_status} to ${status}`);
        }

        // 2. Provider Lock
        if (tx.provider_id && tx.provider_id !== providerId) {
            throw new Error(`PROVIDER_LOCK_VIOLATION: Tx bound to ${tx.provider_id}, received ${providerId}`);
        }

        // 3. Temporal Guard (System-Time Authority)
        if (tx.last_ingested_at && new Date(ingestedAt) < new Date(tx.last_ingested_at)) {
            throw new Error(`TEMPORAL_REGRESSION: Event ingested at ${ingestedAt} is older than current state`);
        }
    }

    /**
     * Strong Idempotency Check.
     */
    validateIdempotency(tx, key, hash, status) {
        if (tx.idempotency_key === key) {
            if (tx.payload_hash && tx.payload_hash !== hash) {
                throw new Error(`IDEMPOTENCY_POISON: Payload mismatch for key ${key}`);
            }
            if (this.STATE_RANK[tx.execution_status] >= this.STATE_RANK[status]) {
                // If we've already reached or surpassed this state, it's a success no-op
                return true;
            }
        }
        return false;
    }

    /**
     * Step 5: Reversal Engine
     * Generates a symmetric compensation event.
     */
    async initiateReversal(transactionId, reason) {
        // Enforce: Can only reverse once
        // Enforce: Must reference parent_ledger_event_id
        // ... handled in Step 6B.5 implementation detail
        logger.warn(`[SettlementEngine] Reversal triggered for TX:${transactionId} Reason:${reason}`);
    }
}

module.exports = new SettlementEngine();
