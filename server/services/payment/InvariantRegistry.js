const logger = require('../../utils/logger');
const supabase = require('../../config/database');

/**
 * InvariantRegistry - The Declarative Truth Engine
 * Enforces financial invariants against immutable ledger versions.
 */
class InvariantRegistry {
    constructor() {
        this.invariants = new Map();
    }

    /**
     * Register a new invariant rule
     * @param {Object} rule { name, evaluate, severity }
     */
    register(rule) {
        if (!rule.name || typeof rule.evaluate !== 'function') {
            throw new Error('[InvariantRegistry] Invalid rule definition');
        }
        this.invariants.set(rule.name, rule);
        logger.info(`[InvariantRegistry] Registered rule: ${rule.name}`);
    }

    /**
     * Evaluate a specific invariant against a database version (Snapshot)
     * @param {string} name 
     * @param {Object} context { walletId, versionId, event }
     */
    async evaluate(name, context) {
        const rule = this.invariants.get(name);
        if (!rule) throw new Error(`[InvariantRegistry] Unknown invariant: ${name}`);

        const { walletId, versionId, event } = context;

        // ── 1. Fetch Immutable Ledger Snapshot ────────────────────────
        // We query the state relative to the versionId (last transaction ID)
        // to ensure we are not checking an un-persisted memory clone.
        const { data: snapshot, error } = await supabase.rpc('get_ledger_snapshot', {
            p_wallet_id: walletId,
            p_as_of_tx_id: versionId
        });

        if (error) {
            logger.error(`[InvariantRegistry] Snapshot fetch failed for ${name}`, { error: error.message });
            return { valid: false, error: 'SNAPSHOT_MISSING' };
        }

        // ── 2. Run Deterministic Evaluation ──────────────────────────
        try {
            const isValid = await rule.evaluate(snapshot, event);
            
            if (!isValid) {
                logger.error(`[INVARIANT_VIOLATION] Rule: ${name} failed. System entering containment.`);
                return { valid: false, rule: name };
            }

            return { valid: true };
        } catch (evalErr) {
            logger.error(`[InvariantRegistry] Evaluation crash: ${name}`, { error: evalErr.message });
            return { valid: false, error: 'EVALUATION_CRASH' };
        }
    }

    /**
     * Run all applicable invariants for a context
     */
    async verifyAll(context) {
        const results = [];
        for (const name of this.invariants.keys()) {
            results.push(await this.evaluate(name, context));
        }
        return results;
    }
}

const registry = new InvariantRegistry();

// ── Register Default Principles ──────────────────────────────────────────

registry.register({
    name: 'SAFE_MODE_MIN_DWELL',
    evaluate: (snapshot, context) => {
        // Enforce 120s floor using DB-persisted stable_since timestamps
        const dwellTime = (Date.now() - new Date(snapshot.stable_since).getTime()) / 1000;
        return dwellTime >= 120;
    },
    severity: 'CRITICAL'
});

registry.register({
    name: 'TX_IDEMPOTENCY_FINALITY',
    evaluate: async (snapshot, context) => {
        // Ensure no duplicated impact on this wallet for the given causal chain
        const { data } = await supabase
            .from('webhook_events')
            .select('id')
            .eq('external_id', context.transactionId)
            .maybeSingle();
        return !data; // Invalid if event already processed in this snapshot
    },
    severity: 'BLOCKER'
});

module.exports = registry;
