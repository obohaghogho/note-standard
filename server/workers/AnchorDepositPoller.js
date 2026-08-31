'use strict';
/**
 * AnchorDepositPoller.js
 * ══════════════════════════════════════════════════════════════════════════════
 * PERMANENT SERVER-SIDE BACKGROUND POLLER for Anchor BaaS deposits.
 *
 * This worker runs every 30 seconds on the server and polls Anchor's Core
 * Banking API for new inbound NIP transactions across ALL dedicated accounts.
 * Any uncredited deposit is automatically created as a transaction and credited
 * via the DepositCreditEngine.
 *
 * WHY THIS EXISTS:
 *   Anchor webhooks are unreliable (HMAC misconfiguration, network issues, etc).
 *   This poller ensures deposits are ALWAYS credited within 30 seconds regardless
 *   of whether webhooks arrive. Webhooks are an optimization for instant credit;
 *   this poller is the safety net.
 *
 * GUARANTEES:
 *   - Idempotent: uses provider_reference to prevent double-crediting
 *   - Non-blocking: errors in one account don't affect others
 *   - Lightweight: only queries Anchor API and does DB lookups
 *   - Self-healing: automatically retries on next interval after errors
 *
 * NoteStandard Financial Platform — Permanent Deposit Auto-Credit Fix
 */

const supabase = require('../config/database');
const logger   = require('../utils/logger');

let intervalId = null;
let isRunning  = false;

const AnchorDepositPoller = {
  /**
   * Start the background polling loop.
   * @param {number} intervalMs - Polling interval in milliseconds (default: 30000 = 30s)
   */
  start(intervalMs = 30000) {
    if (intervalId) {
      logger.warn('[AnchorDepositPoller] Already running — skipping duplicate start');
      return;
    }

    // Only start if Anchor is enabled
    if (process.env.ANCHOR_ENABLED !== 'true') {
      logger.info('[AnchorDepositPoller] Anchor is disabled (ANCHOR_ENABLED !== true). Poller not started.');
      return;
    }

    logger.info(`[AnchorDepositPoller] ✅ Starting server-side deposit poller (interval: ${intervalMs / 1000}s)`);

    intervalId = setInterval(() => {
      this.poll().catch(err => {
        logger.error(`[AnchorDepositPoller] Poll cycle error: ${err.message}`);
      });
    }, intervalMs);

    // Initial run after 5 seconds (give boot sequence time to stabilize)
    setTimeout(() => {
      this.poll().catch(err => {
        logger.error(`[AnchorDepositPoller] Initial poll error: ${err.message}`);
      });
    }, 5000);
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info('[AnchorDepositPoller] Stopped.');
    }
  },

  /**
   * Core polling logic — fetches ALL dedicated Anchor accounts,
   * queries Anchor API for recent inbound transactions, and credits
   * any that haven't been credited yet.
   */
  async poll() {
    // Prevent overlapping poll cycles
    if (isRunning) return;
    isRunning = true;

    try {
      const anchorService = require('../services/anchorService');

      // Check if Anchor service is actually enabled and reachable
      if (!anchorService.isEnabled || (typeof anchorService.isEnabled === 'function' && !anchorService.isEnabled())) {
        return;
      }

      // Fetch ALL dedicated Anchor accounts (all users)
      const { data: dedicatedAccs, error: dvaErr } = await supabase
        .from('dedicated_accounts')
        .select('user_id, account_number, provider_account_id, bank_name')
        .eq('provider', 'anchor');

      if (dvaErr || !dedicatedAccs || dedicatedAccs.length === 0) {
        return; // No accounts to poll — this is normal for fresh deployments
      }

      // Deduplicate by user_id (one user might have multiple account rows)
      const userIds = [...new Set(dedicatedAccs.map(a => a.user_id))];

      let totalCredited = 0;

      for (const userId of userIds) {
        try {
          const credited = await anchorService.syncPendingAnchorDeposits(userId);
          if (credited && credited.length > 0) {
            totalCredited += credited.length;
            logger.info(`[AnchorDepositPoller] ✅ Auto-credited ${credited.length} deposit(s) for user ${userId}`);
          }
        } catch (userErr) {
          // Log but don't break the loop — one user's error shouldn't block others
          logger.warn(`[AnchorDepositPoller] Error syncing user ${userId}: ${userErr.message}`);
        }
      }

      if (totalCredited > 0) {
        logger.info(`[AnchorDepositPoller] ═══ Poll cycle complete: ${totalCredited} new deposit(s) credited across ${userIds.length} account(s) ═══`);
      }
    } catch (err) {
      logger.error(`[AnchorDepositPoller] Global poll error: ${err.message}`);
    } finally {
      isRunning = false;
    }
  },
};

module.exports = AnchorDepositPoller;
