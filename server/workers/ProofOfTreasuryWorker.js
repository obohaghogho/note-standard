'use strict';
/**
 * ProofOfTreasuryWorker.js
 * ========================
 * Background worker running periodic real-time Proof of Treasury audits (every 3 minutes).
 *
 * @module workers/ProofOfTreasuryWorker
 */

const logger = require('../utils/logger');
const ProofOfTreasuryEngine = require('../services/treasury/ProofOfTreasuryEngine');

let intervalId = null;

const ProofOfTreasuryWorker = {
  start(intervalMs = 3 * 60 * 1000) {
    if (intervalId) return;
    logger.info('[ProofOfTreasuryWorker] Starting worker...');

    intervalId = setInterval(() => {
      this.audit().catch(err => logger.error(`[ProofOfTreasuryWorker] Audit error: ${err.message}`));
    }, intervalMs);

    // Initial run
    setImmediate(() => this.audit().catch(() => {}));
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  async audit() {
    try {
      const result = await ProofOfTreasuryEngine.verifyAll();
      if (!result.verified) {
        logger.warn(`[ProofOfTreasuryWorker] Proof of Treasury audit completed with ${result.driftCount} discrepancy/discrepancies`);
      }
    } catch (err) {
      logger.error(`[ProofOfTreasuryWorker] Audit cycle failed: ${err.message}`);
    }
  },
};

module.exports = ProofOfTreasuryWorker;
