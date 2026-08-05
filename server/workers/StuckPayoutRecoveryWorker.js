'use strict';

const supabase = require('../config/database');
const logger = require('../utils/logger');
const GreySettlementProvider = require('../services/settlement/GreySettlementProvider');
const WithdrawalWorkflowService = require('../services/treasury/WithdrawalWorkflowService');

/**
 * StuckPayoutRecoveryWorker
 * =========================
 * Background recovery worker for stuck payouts and unconfirmed provider transactions.
 *
 * Operational Strategy:
 *  - Polls transactions in 'SENDING', 'PROVIDER_ACCEPTED', or 'PROVIDER_PROCESSING' older than 10 mins.
 *  - Queries Grey Transaction API for real status.
 *  - If COMPLETED -> finalizes withdrawal, deducts balance, sends notification.
 *  - If FAILED/REJECTED -> triggers automatic rollback & unfreezes funds.
 *  - If UNKNOWN -> routes to Dead-Letter Queue (DLQ) / Manual Operator Review.
 */
class StuckPayoutRecoveryWorker {
  constructor() {
    this.greyProvider = new GreySettlementProvider();
    this.intervalMs = 60000; // Poll every 60 seconds
    this.timer = null;
    this.isProcessing = false;
  }

  start() {
    logger.info('[StuckPayoutRecoveryWorker] Background recovery worker started (60s interval)...');
    this.timer = setInterval(() => this.processStuckPayouts().catch(e => {
      logger.error(`[StuckPayoutRecoveryWorker] Error in poll loop: ${e.message}`);
    }), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[StuckPayoutRecoveryWorker] Recovery worker stopped.');
    }
  }

  async processStuckPayouts() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const { data: stuckTxs, error } = await supabase
        .from('transactions')
        .select('*')
        .in('status', ['SENDING', 'PROVIDER_ACCEPTED', 'PROVIDER_PROCESSING'])
        .lte('updated_at', tenMinsAgo)
        .limit(50);

      if (error) {
        logger.error(`[StuckPayoutRecoveryWorker] Query error: ${error.message}`);
        return;
      }

      if (!stuckTxs || stuckTxs.length === 0) {
        return;
      }

      logger.info(`[StuckPayoutRecoveryWorker] Found ${stuckTxs.length} stuck payouts. Beginning status recovery...`);

      for (const tx of stuckTxs) {
        const ref = tx.reference_id || tx.provider_reference;
        if (!ref) continue;

        try {
          const extTx = await this.greyProvider.getTransaction(ref).catch(() => null);

          if (!extTx) {
            logger.warn(`[StuckPayoutRecoveryWorker] Payout ${ref} not found on provider API. Routing to DLQ/Manual Review.`);
            await supabase.from('transactions').update({
              status: 'MANUAL_REVIEW',
              metadata: { ...(tx.metadata || {}), manual_review_reason: 'Missing from provider API after 10m' }
            }).eq('id', tx.id);
            continue;
          }

          if (extTx.status === 'COMPLETED') {
            logger.info(`[StuckPayoutRecoveryWorker] Recovered COMPLETED payout ${ref}. Finalizing...`);
            await WithdrawalWorkflowService.finalizeSuccessfulSettlement(ref, extTx.providerReference);
          } else if (extTx.status === 'FAILED') {
            logger.info(`[StuckPayoutRecoveryWorker] Recovered FAILED payout ${ref}. Rolling back balance...`);
            await WithdrawalWorkflowService.rollbackFailedWithdrawal(tx.id, 'Provider rejected payout during background check', 'REJECTED');
          } else {
            logger.info(`[StuckPayoutRecoveryWorker] Payout ${ref} still processing on provider side. Touch timestamp.`);
            await supabase.from('transactions').update({ updated_at: new Date().toISOString() }).eq('id', tx.id);
          }
        } catch (txErr) {
          logger.error(`[StuckPayoutRecoveryWorker] Failed to recover transaction ${tx.id}: ${txErr.message}`);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new StuckPayoutRecoveryWorker();
