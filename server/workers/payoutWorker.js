const supabase = require('../config/database');
const logger = require('../utils/logger');
const payoutService = require('../services/payment/payoutService');
const SystemState = require('../config/SystemState');

let intervalId = null;
const RUN_INTERVAL = 30000; // 30 seconds
const currentJobs = new Set();

/**
 * Payout Dispatcher Worker (Autonomous)
 * Institutional-grade autonomous dispatcher for approved withdrawal requests.
 * Implements Execution Intent Logging and SLA-aware error handling.
 */
class PayoutWorker {
    static start() {
        if (intervalId) return;
        logger.info("[PayoutWorker] Autonomous Dispatcher active. Monitoring approved payouts...");
        intervalId = setInterval(() => this.dispatchPendingPayouts(), RUN_INTERVAL);
        setTimeout(() => this.dispatchPendingPayouts(), 5000); // Quick start
    }

    static async dispatchPendingPayouts() {
        // Governance Check: Emergency Kill Switch
        if (SystemState.mode === "SAFE") {
            return; // Absolute Mutation Halt
        }

        const mode = SystemState.getWithdrawalMode();
        if (mode === "FROZEN") {
            return; // Absolute Withdrawal Halt
        }

        try {
            // 1. Fetch Approved Payouts
            const { data: pending, error } = await supabase
                .from('payout_requests')
                .select('*')
                .eq('status', 'approved')
                .limit(10); // Batch size to prevent memory spikes

            if (error) throw error;
            if (!pending || pending.length === 0) return;

            for (const payout of pending) {
                if (currentJobs.has(payout.id)) continue;
                
                // DEGRADED Mode Check: Limit to low-risk payouts
                if (mode === "DEGRADED" && (payout.amount > 100 || payout.risk_score >= 40)) {
                    continue; 
                }

                currentJobs.add(payout.id);
                this.executeDispatch(payout).finally(() => {
                    currentJobs.delete(payout.id);
                });
            }
        } catch (err) {
            logger.error("[PayoutWorker] Dispatch cycle failed:", err.message);
        }
    }

    /**
     * Execution Intent Logging & Provider Dispatch
     */
    static async executeDispatch(payout) {
        logger.info(`[PayoutWorker] Dispatching payout ${payout.id} (Amount: ${payout.amount} ${payout.currency})`);

        try {
            // 2. STEP A: INTENT LOGGING (Transition to PROCESSING)
            await payoutService.updatePayoutState(payout.id, 'PROCESSING', {
                retry_count: (payout.retry_count || 0) + 1
            });

            // 3. STEP B: PROVIDER DISPATCH
            let result;
            if (payout.payout_method === 'bank_transfer') {
                const dest = payout.destination || {};
                result = await payoutService.createFincraTransfer(
                    dest.bankCode,
                    dest.accountNumber,
                    payout.amount,
                    payout.currency,
                    payout.id, // Reference = payout_id (Institutional Determinism)
                    `Withdrawal-${payout.id.substring(0,8)}`,
                    { accountName: dest.accountName, email: dest.email }
                );
            } else if (payout.payout_method === 'crypto') {
                const dest = payout.destination || {};
                result = await payoutService.createNowPaymentsPayout(
                    dest.address,
                    payout.amount,
                    payout.currency,
                    payout.id,
                    dest.network
                );
            } else {
                throw new Error(`Unsupported payout method: ${payout.payout_method}`);
            }

            // 4. STEP C: FINALITY PROMOTION (SENT -> CONFIRMING)
            if (result.success) {
                await payoutService.updatePayoutState(payout.id, 'SENT', {
                    latency: result.latency,
                    rawResponse: result.rawResponse,
                    providerReference: result.payoutId
                });
                
                // Immediate promotion to CONFIRMING for deep finality sweep
                await payoutService.updatePayoutState(payout.id, 'CONFIRMING');
                
                logger.info(`[PayoutWorker] Payout ${payout.id} successfully sent to provider. Reference: ${result.payoutId}`);
            } else {
                // If API rejected the call (e.g. 400 Bad Request)
                await payoutService.updatePayoutState(payout.id, 'FAILED_FINAL', {
                    error: result.error,
                    latency: result.latency,
                    rawResponse: result.rawResponse
                });
                logger.error(`[PayoutWorker] Payout ${payout.id} REJECTED by provider: ${result.error}`);
            }

        } catch (err) {
            // 5. UNCERTAINTY HANDLING (Timeout/Crash)
            // If we caught an exception during the API call, we mark as UNCERTAIN.
            logger.warn(`[PayoutWorker] Execution Ambiguity for ${payout.id}: ${err.message}`);
            
            await payoutService.updatePayoutState(payout.id, 'PROCESSING_UNCERTAIN', {
                error: err.message,
                uncertain: true
            });
        }
    }
}

module.exports = PayoutWorker;
