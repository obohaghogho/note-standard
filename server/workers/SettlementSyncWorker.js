'use strict';

const supabase = require('../config/database');
const logger = require('../utils/logger');
const SettlementPolicyService = require('../services/settlement/SettlementPolicyService');

/**
 * SettlementSyncWorker
 * ─────────────────────────────────────────────────────────────────────────────
 * Periodic background worker for:
 *  1. Promoting pending deposits → available balances once settled.
 *  2. Sweeping expired withdrawal reservations and reversing them.
 *  3. Reconciling pending/processing platform revenue settlements with Fincra API.
 */
class SettlementSyncWorker {
  constructor() {
    this.isSyncing = false;
    this.timer = null;
  }

  /**
   * Start the periodic settlement sync & reconciliation worker interval.
   * Default interval: 5 minutes (300,000 ms).
   *
   * @param {number} [intervalMs=300000]
   */
  start(intervalMs = 300000) {
    if (this.timer) {
      logger.info('[SettlementSyncWorker] Worker interval already active.');
      return;
    }
    logger.info(`[SettlementSyncWorker] Starting settlement sync & reconciliation worker (${intervalMs / 1000}s interval)...`);
    this.timer = setInterval(
      () => this.runCycle().catch(e => logger.error(`[SettlementSyncWorker] Unhandled cycle error: ${e.message}`)),
      intervalMs
    );
    // Initial run after 5 seconds to settle any pending items on boot
    setTimeout(
      () => this.runCycle().catch(e => logger.error(`[SettlementSyncWorker] Unhandled initial cycle error: ${e.message}`)),
      5000
    );
  }

  /**
   * Stop the periodic worker timer.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[SettlementSyncWorker] Worker stopped.');
    }
  }

  /**
   * Run one full reconciliation & promotion cycle
   */
  async runCycle() {
    if (this.isSyncing) {
      logger.info('[SettlementSyncWorker] Sync cycle already running. Skipping.');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();
    logger.info('[SettlementSyncWorker] Starting settlement sync & promotion cycle...');

    try {
      const promotedCount = await this.promotePendingDeposits();
      const reversedCount = await this.sweepTimedOutWithdrawals();
      const platformReconciledCount = await this.reconcilePlatformSettlements();

      const durationMs = Date.now() - startTime;
      logger.info(`[SettlementSyncWorker] Cycle finished in ${durationMs}ms: ${promotedCount} deposits promoted, ${reversedCount} withdrawals reversed, ${platformReconciledCount} platform settlements reconciled.`);
    } catch (err) {
      logger.error(`[SettlementSyncWorker] Error during sync cycle: ${err.message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Reconcile any pending or timeout-held platform revenue settlements.
   */
  async reconcilePlatformSettlements() {
    try {
      const PlatformSettlementService = require('../services/settlement/PlatformSettlementService');
      const result = await PlatformSettlementService.reconcilePendingSettlements();
      if (result && result.reconciled > 0) {
        logger.info(`[SettlementSyncWorker] ✅ Reconciled ${result.reconciled}/${result.total || result.reconciled} platform revenue settlements.`);
      }
      return result?.reconciled || 0;
    } catch (err) {
      logger.error(`[SettlementSyncWorker] Error reconciling platform revenue settlements: ${err.message}`);
      return 0;
    }
  }

  /**
   * Promote pending deposits to available balances
   */
  async promotePendingDeposits() {
    let promoted = 0;

    // Fetch all unpromoted pending items
    const { data: pendingItems, error } = await supabase
      .from('settlement_pending_items')
      .select('*')
      .is('promoted_at', null)
      .eq('flagged_for_review', false)
      .limit(50);

    if (error) {
      logger.error(`[SettlementSyncWorker] Failed to fetch pending items: ${error.message}`);
      return 0;
    }

    if (!pendingItems || pendingItems.length === 0) {
      return 0;
    }

    const FincraSettlementProvider = require('../services/settlement/FincraSettlementProvider');

    for (const item of pendingItems) {
      try {
        let isSettled = false;

        // Check if expected settlement time has elapsed
        if (item.expected_settlement_at && new Date(item.expected_settlement_at) <= new Date()) {
          isSettled = true;
        } else if (item.provider === 'fincra') {
          // Poll provider API
          const statusResult = await FincraSettlementProvider.getDepositSettlementStatus(item.provider_reference);
          if (statusResult.isSettled) {
            isSettled = true;
          }
        }

        if (isSettled) {
          // Promote via RPC settle_pending_to_available
          const { error: rpcErr } = await supabase.rpc('settle_pending_to_available', {
            p_wallet_id: item.wallet_id,
            p_amount: parseFloat(item.amount),
          });

          if (rpcErr) {
            logger.error(`[SettlementSyncWorker] RPC settle_pending_to_available failed for item ${item.id}: ${rpcErr.message}`);
            continue;
          }

          const nowIso = new Date().toISOString();

          // Mark as promoted
          await supabase
            .from('settlement_pending_items')
            .update({
              promoted_at: nowIso,
              provider_status: 'settled',
              promotion_attempts: item.promotion_attempts + 1,
            })
            .eq('id', item.id);

          // Update fincra_transactions
          await supabase
            .from('fincra_transactions')
            .update({ status: 'SUCCESSFUL' })
            .eq('fincra_reference', item.provider_reference);

          // Notify user
          try {
            const notificationService = require('../services/notificationService');
            await notificationService.sendNotification(item.user_id, {
              type: 'DEPOSIT_SETTLED',
              title: 'Deposit Settled & Available',
              message: `Your pending deposit of ${item.currency} ${parseFloat(item.amount).toLocaleString()} is now settled and available for withdrawal.`,
              data: { amount: item.amount, currency: item.currency, providerRef: item.provider_reference },
            });
          } catch (nErr) {
            logger.warn(`[SettlementSyncWorker] Notification warning: ${nErr.message}`);
          }

          promoted++;
          logger.info(`[SettlementSyncWorker] ✅ Promoted deposit ${item.provider_reference} (${item.currency} ${item.amount}) to Available for user ${item.user_id}`);

        } else {
          // Increment promotion attempt count
          const attempts = item.promotion_attempts + 1;
          const updates = { promotion_attempts: attempts };

          // Flag for review if stuck for > 96 attempts (~8 hours)
          if (attempts >= 96) {
            updates.flagged_for_review = true;
            updates.flag_reason = 'Exceeded maximum settlement promotion attempts without provider confirmation.';
            logger.warn(`[SettlementSyncWorker] ⚠️ Pending deposit ${item.provider_reference} flagged for manual review after ${attempts} attempts.`);
          }

          await supabase
            .from('settlement_pending_items')
            .update(updates)
            .eq('id', item.id);
        }
      } catch (itemErr) {
        logger.error(`[SettlementSyncWorker] Error processing pending item ${item.id}: ${itemErr.message}`);
      }
    }

    return promoted;
  }

  /**
   * Sweep and reverse timed-out withdrawal reservations
   */
  async sweepTimedOutWithdrawals() {
    let reversed = 0;

    // Fetch active withdrawal reservations
    const { data: reservedTxs, error } = await supabase
      .from('fincra_transactions')
      .select('*')
      .eq('type', 'WITHDRAWAL')
      .in('status', ['RESERVED', 'PENDING', 'CREATED'])
      .limit(50);

    if (error || !reservedTxs || reservedTxs.length === 0) {
      return 0;
    }

    const { reversePayoutReservation } = require('../services/fincra/payout');

    for (const tx of reservedTxs) {
      try {
        const policy = await SettlementPolicyService.getPolicy(tx.provider || 'fincra', tx.currency);
        const timeoutMs = policy.withdrawal_timeout_minutes * 60 * 1000;
        const createdTime = new Date(tx.created_at).getTime();

        if (Date.now() - createdTime >= timeoutMs) {
          logger.warn(`[SettlementSyncWorker] ⏱️ Withdrawal ${tx.reference} timed out (${policy.withdrawal_timeout_minutes}m limit). Reversing reservation...`);

          const isReversed = await reversePayoutReservation(tx.reference, `Withdrawal reservation timed out after ${policy.withdrawal_timeout_minutes} minutes`);
          if (isReversed) {
            reversed++;
          }
        }
      } catch (txErr) {
        logger.error(`[SettlementSyncWorker] Error checking timeout for tx ${tx.id}: ${txErr.message}`);
      }
    }

    return reversed;
  }
}

module.exports = new SettlementSyncWorker();
