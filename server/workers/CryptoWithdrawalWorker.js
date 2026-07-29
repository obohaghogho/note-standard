'use strict';
/**
 * CryptoWithdrawalWorker.js
 * =========================
 * Background worker processing pending payout requests in crypto_withdrawal_queue.
 *
 * @module workers/CryptoWithdrawalWorker
 */

const logger = require('../utils/logger');
const CryptoWithdrawalQueueService = require('../services/payment/CryptoWithdrawalQueueService');

let intervalId = null;

const CryptoWithdrawalWorker = {
  start(intervalMs = 30000) {
    if (intervalId) return;
    logger.info('[CryptoWithdrawalWorker] Starting worker...');

    intervalId = setInterval(() => {
      this.process().catch(err => logger.error(`[CryptoWithdrawalWorker] Error: ${err.message}`));
    }, intervalMs);

    // Initial run
    setImmediate(() => this.process().catch(() => {}));
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  async process() {
    try {
      let processed = 0;
      let result;
      do {
        result = await CryptoWithdrawalQueueService.processNext();
        if (result) processed++;
      } while (result && processed < 5);

      if (processed > 0) {
        logger.info(`[CryptoWithdrawalWorker] Processed ${processed} pending crypto payout(s)`);
      }
    } catch (err) {
      logger.error(`[CryptoWithdrawalWorker] Process loop error: ${err.message}`);
    }
  },
};

module.exports = CryptoWithdrawalWorker;
