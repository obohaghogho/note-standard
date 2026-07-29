'use strict';
/**
 * DepositAddressPoolRefiller.js
 * =============================
 * Background worker checking available deposit address pools
 * per crypto asset and refilling them if available count is low.
 *
 * @module workers/DepositAddressPoolRefiller
 */

const logger = require('../utils/logger');
const CryptoDepositPoolService = require('../services/payment/CryptoDepositPoolService');

let intervalId = null;

const DepositAddressPoolRefiller = {
  start(intervalMs = 15 * 60 * 1000) {
    if (intervalId) return;
    logger.info('[DepositAddressPoolRefiller] Starting address pool refiller worker...');

    intervalId = setInterval(() => {
      this.checkAndRefill().catch(err => logger.error(`[DepositAddressPoolRefiller] Error: ${err.message}`));
    }, intervalMs);

    // Initial run
    setImmediate(() => this.checkAndRefill().catch(() => {}));
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  async checkAndRefill() {
    try {
      const metrics = await CryptoDepositPoolService.getPoolMetrics();
      logger.info('[DepositAddressPoolRefiller] Checked pool metrics:', metrics);
    } catch (err) {
      logger.error(`[DepositAddressPoolRefiller] Check failed: ${err.message}`);
    }
  },
};

module.exports = DepositAddressPoolRefiller;
