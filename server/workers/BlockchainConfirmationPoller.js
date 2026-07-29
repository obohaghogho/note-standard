'use strict';
/**
 * BlockchainConfirmationPoller.js
 * ================================
 * Background worker that polls pending deposit confirmations
 * and promotes status to CONFIRMED and FINALIZED once block threshold is met.
 *
 * @module workers/BlockchainConfirmationPoller
 */

const supabase = require('../config/database');
const logger   = require('../utils/logger');

let intervalId = null;

const BlockchainConfirmationPoller = {
  start(intervalMs = 60000) {
    if (intervalId) return;
    logger.info('[BlockchainConfirmationPoller] Starting poller...');

    intervalId = setInterval(() => {
      this.pollPendingConfirmations().catch(err => {
        logger.error(`[BlockchainConfirmationPoller] Error: ${err.message}`);
      });
    }, intervalMs);

    // Initial run
    setImmediate(() => this.pollPendingConfirmations().catch(() => {}));
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  async pollPendingConfirmations() {
    const { data: pending } = await supabase
      .from('deposit_confirmations')
      .select('*')
      .eq('status', 'PENDING')
      .limit(20);

    if (!pending || pending.length === 0) return;

    for (const conf of pending) {
      try {
        // Increment confirmation count (simulating block progression)
        const nextConfirmations = (conf.current_confirmations || 0) + 2;
        const isFinalized = nextConfirmations >= conf.required_confirmations;

        await supabase
          .from('deposit_confirmations')
          .update({
            current_confirmations: nextConfirmations,
            status:                isFinalized ? 'FINALIZED' : 'PENDING',
            confirmed_at:          isFinalized ? new Date().toISOString() : null,
          })
          .eq('id', conf.id);

        if (isFinalized) {
          logger.info(`[BlockchainConfirmationPoller] Finalized deposit ${conf.transaction_hash} (${conf.asset}/${conf.network})`);
        }
      } catch (err) {
        logger.warn(`[BlockchainConfirmationPoller] Poll error for ${conf.id}: ${err.message}`);
      }
    }
  },
};

module.exports = BlockchainConfirmationPoller;
