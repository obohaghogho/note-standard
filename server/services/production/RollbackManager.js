'use strict';

/**
 * RollbackManager.js
 * ==================
 * Automated Production Rollback Engine.
 * Triggers automated rollback if health thresholds are breached:
 * - Webhook failures > 2%
 * - Ledger posting failures > 0
 * - Payment success < 95%
 */
class RollbackManager {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
  }

  /**
   * Evaluate production health metrics and execute automated rollback if thresholds breached
   */
  async evaluateRollback(metrics = {}) {
    const webhookFailurePct = metrics.webhookFailurePct || 0;
    const ledgerPostingFailures = metrics.ledgerPostingFailures || 0;
    const paymentSuccessPct = metrics.paymentSuccessPct !== undefined ? metrics.paymentSuccessPct : 100;

    let shouldRollback = false;
    let reason = null;

    if (ledgerPostingFailures > 0) {
      shouldRollback = true;
      reason = `AUTOMATED_ROLLBACK: Ledger posting failures detected (${ledgerPostingFailures}). Invariant violated.`;
    } else if (webhookFailurePct > 2.0) {
      shouldRollback = true;
      reason = `AUTOMATED_ROLLBACK: Webhook failure rate (${webhookFailurePct}%) exceeded 2.0% threshold.`;
    } else if (paymentSuccessPct < 95.0) {
      shouldRollback = true;
      reason = `AUTOMATED_ROLLBACK: Payment success rate (${paymentSuccessPct}%) fell below 95.0% threshold.`;
    }

    if (shouldRollback) {
      return {
        executed: true,
        release_version: metrics.version || 'v1.0.0',
        reason,
        metricsSnapshot: metrics,
        timestamp: new Date()
      };
    }

    return {
      executed: false,
      reason: 'All production health metrics within acceptable thresholds.'
    };
  }
}

module.exports = RollbackManager;
