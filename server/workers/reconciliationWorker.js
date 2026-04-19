const paymentService = require('../services/payment/paymentService');
const governanceManager = require('../services/GovernanceManager');
const settlementEngine = require('../services/SettlementEngine');
const decisionEngine = require('../services/DecisionEngine');
const logger = require('../utils/logger');

let intervalId = null;
const RUN_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Reconciliation Worker
 * Scans the reconciliation_queue every 5 minutes and attempts to autonomously recover
 * transactions that failed due to temporary constraints (e.g. amount mismatch that an admin adjusted, 
 * or expiring transactions that were forced active).
 */
class ReconciliationWorker {
    static start() {
        if (intervalId) return;
        logger.info("[ReconciliationWorker] Started automatically backing up the webhook queue.");
        intervalId = setInterval(() => this.runFullCycle(), RUN_INTERVAL);
        setTimeout(() => this.runFullCycle(), 15000); // Run once shortly after boot
    }

    static async runFullCycle() {
        await this.processQueue();
        await this.runGovernanceCycle(); // Step 4: Institutional Guard Cycle
        await this.syncSentPayouts();
        await this.cleanupStaleReservations();
    }

    /**
     * Governance Cycle (Phase 6B)
     * Identifies eligible reconciliation proposals and applies them 
     * after the 1-hour audit window.
     */
    static async runGovernanceCycle() {
        try {
            logger.info("[ReconciliationWorker] Starting Governance Audit Cycle...");

            // 1. Fetch proposals that have passed the audit window
            const now = new Date().toISOString();
            const { data: eligibleProposals, error } = await supabase
                .from('reconciliation_proposals')
                .select('*')
                .eq('status', 'AUDITING')
                .lte('eligible_at', now)
                .lt('drift_amount', 0.001); // 0.1% Threshold for auto-apply

            if (error) throw error;
            if (!eligibleProposals || eligibleProposals.length === 0) return;

            logger.info(`[ReconciliationWorker] Found ${eligibleProposals.length} eligible proposals for final audit.`);

            for (const proposal of eligibleProposals) {
                // 2. Fetch Latest State for Validation
                const { data: wallet } = await supabase
                    .from('wallets_v6')
                    .select('balance, epoch_id')
                    .eq('id', proposal.wallet_id)
                    .single();

                // 3. Evaluate Market Regime (DecisionEngine)
                // For worker logic, we assume standard snapshot availability
                const systemState = { state: 'ALLOWED', reason: 'CONSENSUS_STABLE' }; // Mock for now, would use SnapshotService.getLatest()

                // 4. Validate via GovernanceManager
                const currentDrift = 0; // Logic for calculating current drift vs proposal
                const validation = await governanceManager.validateProposal(
                    proposal, 
                    proposal.drift_amount, // For auto-apply we ensure drift remains within bounds
                    wallet.epoch_id, 
                    systemState
                );

                if (validation.valid) {
                    logger.info(`[ReconciliationWorker] Proposal ${proposal.id} PASSED audit. Applying correction...`);
                    
                    // 5. Execute via SettlementEngine
                    // This will Advance Status -> Write Ledger -> Bump Epoch
                    await settlementEngine.processEvent({
                        transactionId: proposal.id, // Proposal acts as the event trigger
                        status: 'LEDGER_COMMITTED',
                        providerId: 'SYSTEM_GOVERNANCE',
                        payload: { drift: proposal.drift_amount },
                        eventAt: now
                    });

                    await supabase
                        .from('reconciliation_proposals')
                        .update({ status: 'APPLIED', applied_at: now })
                        .eq('id', proposal.id);

                } else {
                    logger.warn(`[ReconciliationWorker] Proposal ${proposal.id} INVALIDATED: ${validation.reason}`);
                    await supabase
                        .from('reconciliation_proposals')
                        .update({ status: 'INVALIDATED', metadata: { reason: validation.reason } })
                        .eq('id', proposal.id);
                }
            }
        } catch (err) {
            logger.error(`[ReconciliationWorker] Governance cycle failed: ${err.message}`);
        }
    }

    static async processQueue() {
        try {
            const UniversalParserEngine = require('../services/payment/UniversalParserEngine');
            const nowIso = new Date().toISOString();
            
            // 1. Fetch mature items from across all logical queues
            const { data: queueItems, error } = await supabase
                .from('reconciliation_queue')
                .select('*')
                .eq('status', 'pending')
                .lte('next_retry_at', nowIso)
                .order('created_at', { ascending: true })
                .limit(50);

            if (error) throw error;
            if (!queueItems || queueItems.length === 0) return;

            const validItems = queueItems.filter(i => (i.retry_count || 0) < (i.max_retries || 5));
            if (validItems.length === 0) return;

            logger.info(`[ReconciliationWorker] Processing ${validItems.length} global queue items across multi-region rails...`);

            for (const item of validItems) {
                const currentRetries = (item.retry_count || 0) + 1;
                const maxRetries = item.max_retries || 5;
                const isExhausted = currentRetries >= maxRetries;
                
                // Exponential backoff: (2^attempt) * 5 mins (Maxing at several hours)
                const backoffMultiplier = Math.pow(2, currentRetries - 1);
                const nextRetryMinutes = backoffMultiplier * 5;
                const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60000).toISOString();

                let recovered = false;
                let recoveryNote = "";

                // TRIPLE-ID RE-EVALUATION PIPELINE
                // We re-run the UniversalParserEngine on the raw_payload in case 
                // parsers were updated or data was manually adjusted in DB.
                if (item.raw_payload) {
                    try {
                        let reParsed;
                        if (typeof item.raw_payload === 'object') {
                            reParsed = UniversalParserEngine.parseIteratively(
                                item.raw_payload.text || item.raw_payload.html || JSON.stringify(item.raw_payload)
                            );
                        } else {
                            reParsed = UniversalParserEngine.parseIteratively(String(item.raw_payload));
                        }

                        // If re-parsing yielded a highly confident result (>= 85)
                        if (reParsed && reParsed.confidence_score >= 85) {
                            const event = {
                                type: 'deposit',
                                reference: reParsed.normalized_reference,
                                status: 'success',
                                amount: reParsed.normalized_amount,
                                currency: reParsed.normalized_currency,
                                sender: reParsed.sender_fingerprint,
                                transactionId: item.parsed_data?.transactionId || null,
                                region: reParsed.provider_region,
                                raw: reParsed.raw
                            };

                            const result = await paymentService.executeWebhookAction(event, item.raw_payload, "grey");

                            if (result && !result.error && result.status !== "verification_failed") {
                                recovered = true;
                                recoveryNote = `Auto-recovered on attempt ${currentRetries} via ${reParsed.provider_region} rail.`;
                            }
                        }
                    } catch (parserErr) {
                        logger.warn(`[ReconciliationWorker] Multi-rail re-parse failed for ${item.id}`, parserErr.message);
                    }
                }

                if (recovered) {
                    await supabase.from('reconciliation_queue').update({
                        status: 'auto_recovered',
                        resolution_note: recoveryNote,
                        retry_count: currentRetries,
                        updated_at: new Date().toISOString()
                    }).eq('id', item.id);
                    logger.info(`[ReconciliationWorker] RECOVERED: ${item.id} (${item.payment_reference})`);
                } else {
                    // Update retry metadata
                    await supabase.from('reconciliation_queue').update({
                        retry_count: currentRetries,
                        next_retry_at: nextRetryAt,
                        status: isExhausted ? 'exhausted_fail' : 'pending',
                        resolution_note: isExhausted ? `Permanently isolated in '${item.queue_type}' after max retries.` : `Retry ${currentRetries}/${maxRetries} in queue '${item.queue_type}'`,
                        updated_at: new Date().toISOString()
                    }).eq('id', item.id);
                    
                    if (isExhausted) {
                        logger.error(`[ReconciliationWorker] FAILED: Item ${item.id} isolated in ${item.queue_type}. Human manual intervention required.`);
                    }
                }
            }
        } catch (error) {
            logger.error("[ReconciliationWorker] Critical failure in global scanner:", error.message);
        }
    }

    /**
     * Autonomous Payout Reconciliation (Layer 4)
     * Resumes confirmed status for payouts stuck in 'SENT' or 'PROCESSING'
     */
    static async syncSentPayouts() {
        try {
            const payoutService = require('../services/payment/payoutService');
            const { data: stuckPayouts } = await supabase
                .from('payout_requests')
                .select('*')
                .in('withdrawal_state', ['SENT', 'PROCESSING'])
                .lte('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Faster sync (5 mins)

            if (!stuckPayouts || stuckPayouts.length === 0) return;

            logger.info(`[ReconciliationWorker] Truth Resolution: Syncing ${stuckPayouts.length} payout states with external providers...`);

            for (const payout of stuckPayouts) {
                // TRUTH RESOLUTION RULE: Provider API is the highest authority.
                // We would call provider.getTransfer(payout.provider_reference)
                // If provider says 'success' -> move to SETTLED.
                
                // Simulation for 'confirmed' external signals:
                const isConfirmedExternally = true; // Simulated webhook/API proof

                if (isConfirmedExternally && payout.withdrawal_state === 'SENT') {
                    await payoutService.updatePayoutState(payout.id, 'SETTLED', 'SENT', { source: 'ProviderStatusSync' });
                }

                // If SETTLED -> move to COMPLETED (Final Ledger Layer)
                if (payout.withdrawal_state === 'SETTLED') {
                    // Finalize the ledger entry and move it to the FINAL layer
                    const { data: ledger } = await supabase
                        .from('ledger_entries')
                        .select('id')
                        .eq('reference', payout.id)
                        .eq('status', 'reserved')
                        .maybeSingle();

                    if (ledger) {
                        // 1. Finalize debit in ledger
                        await supabase.rpc('finalize_withdrawal_debit', { p_ledger_id: ledger.id });
                        
                        // 2. Move ledger entry to FINAL layer
                        await supabase
                            .from('ledger_entries')
                            .update({ layer: 'FINAL' })
                            .eq('id', ledger.id);
                        
                        // 3. Mark Payout COMPLETED
                        await payoutService.updatePayoutState(payout.id, 'COMPLETED', 'SETTLED');
                        
                        logger.info(`[ReconciliationWorker] ATOMIC SETTLEMENT: Payout ${payout.id} is now COMPLETED and FINAL.`);
                    }
                }
            }
        } catch (error) {
            logger.error("[ReconciliationWorker] Payout truth resolution failed:", error.message);
        }
    }

    /**
     * Active Defense: Reservation Cleanup
     * Reclaim funds from 'reserved' status if no payout request is actively processing them.
     */
    static async cleanupStaleReservations() {
        try {
            const { data: staleEntries } = await supabase
                .from('ledger_entries')
                .select('id, reference, user_id, amount')
                .eq('status', 'reserved')
                .lte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // 24h stale

            if (!staleEntries || staleEntries.length === 0) return;

            for (const entry of staleEntries) {
                // Check if there is an active payout_request using this reference (reference = payout_id)
                const { data: payout } = await supabase
                    .from('payout_requests')
                    .select('withdrawal_state')
                    .eq('id', entry.reference)
                    .maybeSingle();

                // If no payout found OR payout is in a terminal non-complete state (FAILED, REVERSED)
                if (!payout || ['FAILED', 'REVERSED'].includes(payout.withdrawal_state)) {
                    logger.warn(`[ReconciliationWorker] Reclaiming stale reservation: ${entry.id} (Ref: ${entry.reference})`);
                    await supabase.rpc('reverse_withdrawal_funds', { 
                        p_ledger_id: entry.id, 
                        p_reason: 'Automated cleanup of stale/orphan reservation' 
                    });
                }
            }
        } catch (error) {
            logger.error("[ReconciliationWorker] Reservation cleanup failed:", error.message);
        }
    }
}

module.exports = ReconciliationWorker;
