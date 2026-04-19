const supabase = require('../config/database');
const logger = require('../utils/logger');

/**
 * Invariant Engine (The Mathematical Core)
 * Enforces global and local financial correctness proofs.
 */
class InvariantEngine {
    
    /**
     * Run a full invariant audit cycle.
     * Throws or returns anomalies for the AuditWorker to handle.
     */
    async verifySystemInvariants() {
        const anomalies = [];

        try {
            // 1. GLOBAL: Conservation of Value (Balance Parity)
            // Rule: Sum of all ledger entries for a wallet must match the derived final_balance.
            const { data: walProof, error: proofErr } = await supabase
                .from('wallets')
                .select('id, final_balance, currency');

            for (const wal of walProof) {
                const { data: ledgerSum } = await supabase
                    .from('ledger_entries')
                    .select('amount')
                    .eq('wallet_id', wal.id)
                    .eq('layer', 'FINAL');
                
                const totalLedger = ledgerSum?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
                
                // Allow for tiny epsilon diff due to floating point (though we should move to bigint)
                if (Math.abs(totalLedger - Number(wal.final_balance)) > 0.00000001) {
                    anomalies.push({
                        type: 'INVARIANT_VIOLATION_GLOBAL',
                        scope: 'CONSERVATION_OF_VALUE',
                        entity_id: wal.id,
                        expected: totalLedger,
                        actual: Number(wal.final_balance),
                        severity: 'CRITICAL'
                    });
                }
            }

            // 2. LOCAL: Reserved Parity
            // Rule: wallets.reserved_balance == SUM(payouts in non-terminal states)
            const { data: activePayouts } = await supabase
                .from('payout_requests')
                .select('amount')
                .in('withdrawal_state', ['REQUESTED', 'VALIDATING', 'RESERVED', 'APPROVED', 'PROCESSING', 'SENT', 'SETTLED']);

            const totalActivePayouts = activePayouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
            
            const { data: totalReserved } = await supabase
                .from('ledger_entries')
                .select('amount')
                .eq('status', 'reserved');

            const totalReservedLedger = Math.abs(totalReserved?.reduce((sum, e) => sum + Number(e.amount), 0) || 0);

            if (Math.abs(totalActivePayouts - totalReservedLedger) > 0.01) {
                anomalies.push({
                    type: 'INVARIANT_VIOLATION_LOCAL',
                    scope: 'RESERVED_PARITY',
                    expected: totalActivePayouts,
                    actual: totalReservedLedger,
                    severity: 'HIGH'
                });
            }

            // 3. Chain Integrity (Event Log Continuity)
            const { data: eventChain } = await supabase
                .from('financial_event_log')
                .select('sequence_id, event_hash, previous_event_hash')
                .order('sequence_id', { ascending: false })
                .limit(10);
            
            if (eventChain && eventChain.length > 1) {
                for (let i = 0; i < eventChain.length - 1; i++) {
                    if (eventChain[i].previous_event_hash !== eventChain[i+1].event_hash) {
                        anomalies.push({
                            type: 'INVARIANT_VIOLATION_GLOBAL',
                            scope: 'EVENT_CHAIN_DISCONTINUITY',
                            sequence_id: eventChain[i].sequence_id,
                            severity: 'CRITICAL'
                        });
                    }
                }
            }

            return anomalies;

        } catch (err) {
            logger.error('[InvariantEngine] Audit failed due to internal error:', err);
            throw err;
        }
    }
}

module.exports = new InvariantEngine();
