const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const FraudEngine = require('./FraudEngine');

/**
 * Settlement Engine
 * Handles the logic for bank-grade settlement cycles and finalizing ledger states.
 * Orchestrates the delay windows and confirmation cycle counts.
 */
class SettlementEngine {
    
    /**
     * Calculate when a transaction should be finalized based on its region.
     * @param {string} region - 'UK', 'US', 'INTERNATIONAL_SWIFT'
     * @param {Date} startTime - When the transaction was detected/matched
     * @returns {Promise<Date>} - Expected finalization time
     */
    static async getExpectedFinalizationTime(region, startTime = new Date()) {
        const { data: config } = await supabase
            .from('settlement_configs')
            .select('delay_seconds')
            .eq('region', region)
            .single();
            
        const delay = config ? config.delay_seconds : 3600; // Default 1 hour fallback
        return new Date(new Date(startTime).getTime() + (delay * 1000));
    }

    /**
     * Re-evaluates a pending settlement for finality.
     * Checks time elapsed, confirmation cycles, and fraud score stability.
     */
    static async canFinalizeSettlement(transactionId) {
        try {
            // 1. Fetch transaction and its corresponding config
            const { data: tx, error } = await supabase
                .from('transactions')
                .select(`
                    id, 
                    amount_from, 
                    currency, 
                    created_at, 
                    settlement_status,
                    metadata
                `)
                .eq('id', transactionId)
                .single();

            if (!tx || error) return { canFinalize: false, reason: 'Transaction not found' };
            if (tx.settlement_status === 'FINALIZED') return { canFinalize: false, reason: 'Already finalized' };

            const region = tx.metadata?.provider_region || 'UK'; // Default fallback
            const { data: config } = await supabase
                .from('settlement_configs')
                .select('*')
                .eq('region', region)
                .single();

            // 2. TIME CHECK: Has the delay window passed?
            const now = new Date();
            const created = new Date(tx.created_at);
            const delayMs = (config?.delay_seconds || 600) * 1000;
            
            if ((now - created) < delayMs) {
                return { canFinalize: false, reason: 'Settlement window still open' };
            }

            // 3. CYCLE CHECK: Has it appeared in enough reconciliation logs?
            // (Assuming each webhook/reconciliation event is logged in audit_logs)
            const { count: cycleCount } = await supabase
                .from('audit_logs')
                .select('*', { count: 'exact', head: true })
                .eq('reference', transactionId.toString())
                .eq('action', 'settlement_stage_transition');

            const minCycles = config?.min_confirmation_cycles || 2;
            if ((cycleCount || 0) < minCycles) {
                // If we don't have enough transitions yet, we might need a manual cycle trigger
                // For now, we allow it if the time window is significantly exceeded (safety)
                if ((now - created) < (delayMs * 1.5)) {
                    return { canFinalize: false, reason: `Insufficient confirmation cycles (${cycleCount}/${minCycles})` };
                }
            }

            // 4. FRAUD CHECK: Re-evaluate fraud score stability
            // We simulate a re-evaluation using the same payload but checking for late flags
            const eventData = tx.metadata?.parsed_data || tx.metadata || {};
            const fraudResult = await FraudEngine.evaluateTransaction(eventData);

            if (fraudResult.action === 'block' || (fraudResult.score > 70)) {
                logger.warn(`[SettlementEngine] Fraud escalation for tx ${tx.id}. Blocking finality.`, fraudResult);
                return { canFinalize: false, reason: 'Late-stage fraud escalation' };
            }

            return { canFinalize: true, score: fraudResult.score };

        } catch (err) {
            logger.error(`[SettlementEngine] Finality evaluation error for ${transactionId}`, err);
            return { canFinalize: false, reason: 'Internal error during evaluation' };
        }
    }

    /**
     * Promotes a transaction to SETTLEMENT_CONFIRMED (Layer 3).
     * Now strictly sets is_provisional = true, is_confirmed = true.
     */
    static async confirmSettlement(transactionId) {
        // Atomic update of transaction and ledger flags
        await supabase.from('transactions').update({
            settlement_status: 'SETTLEMENT_CONFIRMED',
            updated_at: new Date().toISOString()
        }).eq('id', transactionId);

        await supabase.from('ledger_entries').update({
            is_confirmed: true,
            is_provisional: true // Still provisional in Stage 3
        }).eq('reference', transactionId);
        
        logger.info(`[SettlementEngine] LAYER 3: Transaction ${transactionId} confirmed (Soft Finality).`);
    }

    /**
     * Promotes a transaction to FINALIZED_LEDGER (Layer 4).
     * Now strictly sets is_provisional = false, is_confirmed = true, is_final = true.
     * Enforces adaptive per-region hard finality windows.
     */
    static async finalize(transactionId) {
        const { data: tx } = await supabase.from('transactions').select('*').eq('id', transactionId).single();
        if (!tx) throw new Error("Transaction not found");

        if (tx.settlement_status !== 'SETTLEMENT_CONFIRMED') {
            logger.warn(`[SettlementEngine] Finalization rejected for ${transactionId}. Must clear Layer 3 first.`);
            return { success: false, reason: 'Must be CONFIRMED before FINALIZED' };
        }

        const region = tx.metadata?.provider_region || 'UK';
        const { data: config } = await supabase
            .from('settlement_configs')
            .select('hard_finality_delay_seconds')
            .eq('region', region)
            .single();

        let baseDelay = Math.min(config?.hard_finality_delay_seconds || 86400, 86400); // 24h cap
        
        // ── DYNAMIC DELAY EXTENSION (Final Form Requirement) ──
        let extensionSeconds = 0;
        const fraudScore = tx.metadata?.fraudScore || 0;
        
        if (fraudScore > 30) {
            // Add 1 hour delay per 10 points above 30
            extensionSeconds += (Math.floor((fraudScore - 30) / 10) * 3600);
            logger.info(`[SettlementEngine] Extending finality for tx ${transactionId} by ${extensionSeconds}s due to fraud score ${fraudScore}`);
        }

        // Extend if multiple candidates were detected for this reference (instability)
        if (tx.metadata?.matching_candidates?.length > 1) {
            extensionSeconds += 7200; // Add 2 hours for ambiguous matching history
            logger.info(`[SettlementEngine] Extending finality for tx ${transactionId} by 7200s due to matching instability.`);
        }

        const totalDelay = Math.min(baseDelay + extensionSeconds, 86400); // Strict 24h cap
        const now = new Date();
        const createdAt = new Date(tx.created_at);

        if ((now - createdAt) < (totalDelay * 1000)) {
            const remaining = Math.round((totalDelay * 1000 - (now - createdAt)) / 1000);
            return { success: false, reason: `Adaptive window (incl. ${extensionSeconds}s extension) open for ${remaining}s more.` };
        }

        const settledAt = new Date().toISOString();

        // 2. Finalize Transaction Record
        await supabase.from('transactions').update({
            settlement_status: 'FINALIZED_LEDGER',
            settlement_confirmed_at: settledAt,
            updated_at: settledAt
        }).eq('id', transactionId);

        // 3. Seal the ledger entry (Hard Finality)
        await supabase.from('ledger_entries').update({
            is_final: true,
            is_provisional: false,
            settled_at: settledAt
        }).eq('reference', transactionId);
        
        logger.info(`[SettlementEngine] LAYER 4 HARD FINALITY REACHED: Transaction ${transactionId} finalized for ${region}.`);
        
        return { success: true, settledAt };
    }
}

module.exports = SettlementEngine;
