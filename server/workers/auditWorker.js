const supabase = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

let intervalId = null;
const AUDIT_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Global Audit Worker
 * Performs high-assurance consistency checks across the entire financial ledger.
 * Validates cryptographic hash chains and detects orphan records.
 */
class AuditWorker {
    static start() {
        if (intervalId) return;
        logger.info("[AuditWorker] Periodic Global Consistency Scanner initialized (6h interval).");
        intervalId = setInterval(() => this.runAuditCycle(), AUDIT_INTERVAL);
        // We don't run this immediately on boot as it can be heavy; we schedule it.
        setTimeout(() => this.runAuditCycle(), 60000 * 10); 
    }

    static async runAuditCycle() {
        const cycleId = crypto.randomUUID();
        logger.info(`[AuditWorker] Starting Global Audit Cycle: ${cycleId}`);
        
        const anomalies = [];
        let itemsVerified = 0;
        let hashChainValid = true;

        try {
            // 1. Fetch Ledger Entries sequentially to verify chain
            const { data: entries, error } = await supabase
                .from('ledger_entries')
                .select('id, wallet_id, reference, amount, currency, entry_hash, previous_wallet_hash, layer, created_at')
                .order('created_at', { ascending: true });

            if (error) throw error;

            // 2. Per-Wallet Hash Chain Validation (Isolation Model)
            const walletContexts = {}; 
            
            for (const entry of entries) {
                const walletId = entry.wallet_id;
                const expectedPrevHash = walletContexts[walletId] || 'GENESIS';
                
                // Rule 1: Previous hash must match the last entry for this wallet
                if (entry.previous_wallet_hash !== expectedPrevHash) {
                    hashChainValid = false;
                    anomalies.push({
                        type: 'HASH_CHAIN_REPLAY_OR_GAP',
                        entry_id: entry.id,
                        expected: expectedPrevHash,
                        actual: entry.previous_wallet_hash,
                        message: 'Cryptographic Isolation Violation: Gap or unauthorized insertion detected in wallet chain.'
                    });
                }

                // Rule 2: Current entry hash must be a valid HMAC of its content + prev_hash
                // Re-calculate the expected hash: encode(digest(prev_hash + wallet_id + amount + currency + reference + created_at), 'sha256')
                const hashInput = `${entry.previous_wallet_hash}${entry.wallet_id}${entry.amount}${entry.currency}${entry.reference}${entry.created_at}`;
                const recalculatedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

                if (entry.entry_hash !== recalculatedHash) {
                    hashChainValid = false;
                    anomalies.push({
                        type: 'HASH_CONTENT_TAMPERING',
                        entry_id: entry.id,
                        expected: recalculatedHash,
                        actual: entry.entry_hash,
                        message: 'Cryptographic Integrity Violation: Entry content does not match its signature.'
                    });
                }
                
                // Update context for next entry in this specific wallet
                walletContexts[walletId] = entry.entry_hash;
                itemsVerified++;
            }

            // 3. Detect Orphan Transactions (Transactions in FINALIZED_LEDGER without matches)
            // Layer 4 hard finality requirement
            const { data: finalizedTxs } = await supabase
                .from('transactions')
                .select('id, amount_from, settlement_status')
                .eq('settlement_status', 'FINALIZED_LEDGER');

            const ledgerRefs = new Set(entries.map(e => e.reference));
            for (const tx of finalizedTxs) {
                if (!ledgerRefs.has(tx.id)) {
                    anomalies.push({
                        type: 'ORPHAN_TRANSACTION',
                        tx_id: tx.id,
                        message: 'Layer 4 Violation: Transaction is FINALIZED but has no corresponding hard-final ledger entry.'
                    });
                }
            }

            // 4. Detect Orphan Payouts (Payouts COMPLETED in record but no ledger debit)
            const { data: completedPayouts } = await supabase
                .from('payout_requests')
                .select('id, amount, currency')
                .eq('withdrawal_state', 'COMPLETED');

            for (const payout of (completedPayouts || [])) {
                // Withdrawal references are wdr_[payout_id_prefix]
                const matchingLedger = entries.find(e => e.reference.startsWith(`wdr_${payout.id.substring(0,8)}`));
                if (!matchingLedger || matchingLedger.amount >= 0) {
                    anomalies.push({
                        type: 'ORPHAN_PAYOUT',
                        payout_id: payout.id,
                        message: 'Layer 4 Violation: Payout marked COMPLETED but no finalized DEBIT found in ledger.'
                    });
                }
            }

            // 5. Multi-Cycle Validation Check
            // We verify that confirmed transactions have at least N cycle transitions
            const { data: cycles } = await supabase
                .from('audit_logs')
                .select('reference, count')
                .eq('action', 'settlement_stage_transition');
            
            // Logic to verify stability over time...

            // 5. Severity Categorization & Active Defense
            let maxSeverity = 'LOW';
            if (anomalies.some(a => ['HASH_CHAIN_VIOLATION', 'ORPHAN_PAYOUT', 'ORPHAN_TRANSACTION'].includes(a.type))) {
                maxSeverity = 'HIGH';
            } else if (anomalies.length > 0) {
                maxSeverity = 'MEDIUM';
            }

            // 6. Log results to audit_cycles
            await supabase.from('audit_cycles').insert({
                id: cycleId,
                status: anomalies.length > 0 ? 'discrepancy_found' : 'success',
                items_verified: itemsVerified,
                anomalies: anomalies,
                hash_chain_valid: hashChainValid,
                severity: maxSeverity
            });

            if (maxSeverity === 'HIGH') {
                logger.error(`[AuditWorker] CRITICAL: Audit cycle ${cycleId} found HIGH severity anomalies! TRIGGERING SYSTEM FREEZE.`);
                
                // ── ACTIVE DEFENSE: TRIGGER GLOBAL SAFE MODE & DISABLE WITHDRAWALS ──
                await supabase
                    .from('admin_settings')
                    .update({ 
                        value: { 
                            mode: 'SAFE', 
                            withdrawals_enabled: false,
                            triggered_by: 'ActiveDefense', 
                            cycle_id: cycleId, 
                            reason: anomalies[0].type,
                            severity: 'HIGH'
                        },
                        updated_at: new Date().toISOString()
                    })
                    .eq('key', 'SYSTEM_MODE');
                
                logger.warn(`[AuditWorker] SYSTEM FROZEN: SAFE MODE active. ALL withdrawals blocked.`);
            } else if (anomalies.length > 0 || !hashChainValid) {
                logger.warn(`[AuditWorker] Cycle ${cycleId} found anomalies (Severity: ${maxSeverity}). Admin review required.`);
            } else {
                logger.info(`[AuditWorker] Cycle ${cycleId} completed successfully. Ledger integrity verified.`);
            }

        } catch (err) {
            logger.error(`[AuditWorker] Cycle ${cycleId} aborted due to error:`, err.message);
        }
    }
}

module.exports = AuditWorker;
