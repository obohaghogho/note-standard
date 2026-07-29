'use strict';
/**
 * NightlyReconciliationWorker.js
 * ================================
 * Cron worker: runs the NightlyReconciliationPipeline every night at 02:00 WAT.
 * Follows the existing Phase 15 worker pattern.
 *
 * @module workers/NightlyReconciliationWorker
 */

const cron     = require('node-cron');
const logger   = require('../utils/logger');
const NightlyReconciliationPipeline = require('../services/treasury/NightlyReconciliationPipeline');

let _running = false;

const NightlyReconciliationWorker = {
  start() {
    // 02:00 WAT (01:00 UTC) every day
    cron.schedule('0 1 * * *', async () => {
      if (_running) {
        logger.warn('[NightlyReconWorker] Previous run still in progress — skipping.');
        return;
      }
      _running = true;
      logger.info('[NightlyReconWorker] Starting nightly reconciliation...');
      try {
        const result = await NightlyReconciliationPipeline.run('NIGHTLY');
        logger.info(`[NightlyReconWorker] Completed: ${result?.status} | discrepancies=${result?.totalDiscrepancies}`);
      } catch (err) {
        logger.error(`[NightlyReconWorker] Failed: ${err.message}`);
      } finally {
        _running = false;
      }
    }, { timezone: 'Africa/Lagos' });

    logger.info('[NightlyReconWorker] Scheduled (02:00 WAT daily).');
  },

  /**
   * Trigger a manual reconciliation run (for admin endpoint).
   */
  async runNow() {
    if (_running) throw new Error('Reconciliation is already running.');
    _running = true;
    try {
      return await NightlyReconciliationPipeline.run('MANUAL');
    } finally {
      _running = false;
    }
  },
};

module.exports = NightlyReconciliationWorker;
