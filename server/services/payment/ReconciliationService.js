const supabase = require("../../config/database");
const logger = require("../../utils/logger");
const PaymentFactory = require("./PaymentFactory");
const paymentService = require("./paymentService");
const payoutService = require("./payoutService");
const LockService = require("./LockService");
const SystemState = require("../../config/SystemState");

/**
 * Reconciliation Service
 * Handles background sweeps to recover transactions stuck in PENDING or PROCESSING.
 */
class ReconciliationService {
  /**
   * Run a sweep for a specific time range and tier
   * @param {Object} options 
   * @param {number} options.minAgeMinutes - Minimum age of transaction to check
   * @param {number} options.maxAgeHours - Maximum age of transaction to check
   * @param {string} options.tierLabel - Label for logging (Tier 1, Tier 2)
   */
  async runSweep(options) {
    const { minAgeMinutes, maxAgeHours, tierLabel } = options;
    const now = new Date();
    const minAgeDate = new Date(now.getTime() - minAgeMinutes * 60000);
    const maxAgeDate = new Date(now.getTime() - maxAgeHours * 60 * 60000);

    logger.info(`[Reconciliation] ${tierLabel} Sweep Started`, { minAgeMinutes, maxAgeHours });

    try {
      // 1. Transaction Reconciliation (Existing)
      await this.runTransactionSweep(minAgeDate, maxAgeDate, tierLabel);

      // 2. Payout Reconciliation (New Institutional Layer)
      await this.runPayoutSweep(minAgeDate, maxAgeDate, tierLabel);

      // 3. Integrity Sentinel (Asynchronous Diagnostic)
      if (tierLabel === "Tier 2") {
          await this.runIntegrityCheck();
      }
    } catch (err) {
      logger.error(`[Reconciliation] ${tierLabel} Sweep Global Error:`, { error: err.message });
    }
  }

  async runTransactionSweep(minAgeDate, maxAgeDate, tierLabel) {
    try {
      // 1. Fetch transactions stuck in non-terminal states
      const { data: stuckTx, error } = await supabase
        .from("transactions")
        .select("*")
        .in("status", ["PENDING", "PROCESSING"])
        .lt("created_at", minAgeDate.toISOString())
        .gt("created_at", maxAgeDate.toISOString())
        .not("provider", "is", null)
        .limit(20); // Process in batches

      if (error) throw error;
      if (!stuckTx || stuckTx.length === 0) {
        logger.info(`[Reconciliation] ${tierLabel}: No stuck transactions found.`);
        return;
      }

      logger.info(`[Reconciliation] ${tierLabel}: Found ${stuckTx.length} items to investigate.`);

      for (const tx of stuckTx) {
        await this.reconcileSingleTransaction(tx);
      }
    } catch (err) {
      logger.error(`[Reconciliation] ${tierLabel} Sweep Failed:`, { error: err.message });
    }
  }

  /**
   * Single Transaction Reconciliation Logic
   */
  async reconcileSingleTransaction(tx) {
    const reference = tx.provider_reference || tx.reference_id;
    if (!reference) return;

    logger.info(`[Reconciliation] Investigating ${tx.id} (Ref: ${reference})`);

    // Use wallet lock to prevent race with late-arriving webhooks
    const lockKey = tx.wallet_id ? `wallet:${tx.wallet_id}:mutex` : reference;

    try {
      await LockService.withLock(lockKey, async () => {
        // ── 1. RE-CHECK STATUS (FOR UPDATE protection done inside finalizeTransaction) ──
        // We fetch the provider to verify against Truth
        const provider = PaymentFactory.getProviderByName(tx.provider || "fincra");
        
        const verification = await provider.verify(reference);
        
        if (verification.success && verification.status === "success") {
          logger.info(`[Reconciliation] SUCCESS: Found missing credit for ${tx.id}. Rescuing...`);
          
          const event = {
            type: tx.type === "SUBSCRIPTION_PAYMENT" ? "SUBSCRIPTION_PAYMENT" : "DEPOSIT",
            reference: reference,
            amount: verification.amount,
            currency: verification.currency,
            status: "success",
            raw: verification.raw
          };

          await paymentService.finalizeTransaction(reference, event);
        } else if (verification.status === "failed") {
          logger.info(`[Reconciliation] FAILED: Provider confirms ${tx.id} failed. Marking as FAILED.`);
          await paymentService.failTransaction(reference, "Provider reconciliation confirmed failure");
        } else {
          logger.info(`[Reconciliation] PENDING: ${tx.id} is still pending at provider. Skipping.`);
        }
      }, { ttl: 20000, retryWindow: 2000 });
    } catch (err) {
      logger.error(`[Reconciliation] Failed to process ${tx.id}:`, { error: err.message });
    }
  }

  /**
   * Payout-Specific Reconciliation (Institutional Logic)
   */
  async runPayoutSweep(minAgeDate, maxAgeDate, tierLabel) {
    try {
      const { data: stuckPayouts, error } = await supabase
        .from("payout_requests")
        .select("*")
        .in("status", ["PROCESSING", "PROCESSING_UNCERTAIN", "CONFIRMING"])
        .lt("updated_at", minAgeDate.toISOString())
        .limit(20);

      if (error) throw error;
      if (!stuckPayouts || stuckPayouts.length === 0) return;

      for (const payout of stuckPayouts) {
        await this.reconcileSinglePayout(payout, tierLabel);
      }
    } catch (err) {
      logger.error("[Reconciliation] Payout Sweep Failed:", err.message);
    }
  }

  async reconcileSinglePayout(payout, tierLabel) {
    const ageMins = (Date.now() - new Date(payout.updated_at).getTime()) / 60000;
    
    // TIERED ALERTING LOGIC
    // Tier 1: Warn on Slack
    if (payout.status === 'PROCESSING' && ageMins > 5) {
        logger.warn(`[RECON_ALERT] Payout ${payout.id} stuck in PROCESSING for ${Math.round(ageMins)}m. Potential Dispatcher Lag.`);
    }

    // Tier 2: Escalate on Slack + Email
    if (payout.status === 'PROCESSING_UNCERTAIN' || payout.retry_count > 2) {
        logger.error(`[RECON_CRITICAL] Payout ${payout.id} in UNCERTAIN state or high retries. Manual review advised.`);
        // Note: Real Email/OpsGenie dispatch would happen here
    }

    // BOUNDED FINALITY RESOLUTION
    if (payout.status === 'CONFIRMING' || payout.status === 'PROCESSING_UNCERTAIN') {
        if (payout.retry_count >= 5 || ageMins > 30) {
            logger.error(`[RECON_ESCALATION] Payout ${payout.id} exceeded finality bounds. Moving to ESCALATED_MANUAL.`);
            await payoutService.updatePayoutState(payout.id, 'ESCALATED_MANUAL', {
                message: "Confirmation timeout/retry limit exceeded."
            });
            return;
        }

        // Attempt Resolution with Provider
        try {
            await LockService.withLock(`payout:${payout.id}`, async () => {
                // Determine Provider
                const providerName = (payout.payout_method === 'bank_transfer' ? 'fincra' : 'nowpayments');
                const PaymentFactory = require('./PaymentFactory');
                const provider = PaymentFactory.getProviderByName(providerName);
                
                const reference = payout.id; // Correct reference is ID
                const verification = await provider.verify(reference);

                if (verification.success && verification.status === 'success') {
                    logger.info(`[Reconciliation] RESOLVED: Payout ${payout.id} settled at provider. Promoting to SETTLED.`);
                    await payoutService.updatePayoutState(payout.id, 'SETTLED', {
                        completed_at: new Date().toISOString(),
                        providerReference: verification.raw?.id || verification.raw?.reference
                    });
                    
                    // Log Anomaly if it eventually succeeded after struggle
                    if (payout.status === 'PROCESSING_UNCERTAIN' || payout.retry_count > 1) {
                        await supabase.from('anomaly_logs').insert({
                            event_type: 'PAYOUT_STUTTER_SUCCESS',
                            target_id: payout.id,
                            severity: 'INFO',
                            metadata: { ageMins, retries: payout.retry_count }
                        });
                    }
                } else if (verification.status === 'failed') {
                    logger.error(`[Reconciliation] RESOLVED: Payout ${payout.id} definitively FAILED at provider.`);
                    await payoutService.updatePayoutState(payout.id, 'FAILED_FINAL', {
                        error: verification.error || "Provider confirmed failure"
                    });
                }
            });
        } catch (err) {
            logger.error(`[Reconciliation] Failed to resolve payout ${payout.id}:`, err.message);
        }
    }
  }

  /**
   * Institutional Integrity Sentinel (Asynchronous Diagnostic)
   * Scans lately active wallets for balance/ledger drift.
   */
  async runIntegrityCheck() {
    try {
        // Find wallets with recent entries
        const { data: recentWallets } = await supabase
            .from('ledger_entries_v6')
            .select('wallet_id')
            .gt('created_at', new Date(Date.now() - 3600000).toISOString())
            .limit(50);
            
        if (!recentWallets) return;
        const uniqueIds = [...new Set(recentWallets.map(w => w.wallet_id))];

        for (const walletId of uniqueIds) {
            const diagnosis = await supabase.rpc('diagnose_ledger_integrity_v6', { p_wallet_id: walletId });
            if (diagnosis.drift && Math.abs(diagnosis.drift) > 0) {
                logger.error(`[INTEGRITY_SENTINEL] DRIFT DETECTED for Wallet ${walletId}:`, diagnosis);
                // SystemState already handles the freeze inside the SQL function or we can call it here:
                SystemState.enterSafeMode(`Ledger drift detected for wallet ${walletId}`);
            }
        }
    } catch (err) {
        logger.error("[Reconciliation] Integrity Check Failed:", err.message);
    }
  }
}

module.exports = new ReconciliationService();
