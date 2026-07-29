'use strict';
/**
 * TreasuryBalanceSyncWorker.js
 * ============================
 * Scheduled worker that triggers the full TreasuryMonitor cycle
 * every SYNC_INTERVAL_MS milliseconds.
 *
 * Integrates with the existing worker registration pattern in
 * server/index.js — exposes start() and stop() like all other workers.
 *
 * Default interval: 5 minutes (configurable via env TREASURY_SYNC_INTERVAL_MS)
 *
 * @module workers/TreasuryBalanceSyncWorker
 */

const logger         = require('../utils/logger');
const TreasuryMonitor = require('../services/treasury/TreasuryMonitor');

const SYNC_INTERVAL_MS = parseInt(process.env.TREASURY_SYNC_INTERVAL_MS || '300000', 10); // 5 min
const BOOT_DELAY_MS    = 15000; // Wait 15s after server start before first sync

let _intervalHandle = null;
let _started        = false;

const TreasuryBalanceSyncWorker = {
  name: 'TreasuryBalanceSyncWorker',

  start() {
    if (_started) {
      logger.warn('[TreasuryBalanceSyncWorker] Already running. start() ignored.');
      return;
    }
    _started = true;

    logger.info(`[TreasuryBalanceSyncWorker] Starting. Interval: ${SYNC_INTERVAL_MS / 1000}s. Boot delay: ${BOOT_DELAY_MS / 1000}s.`);

    // Boot cycle — delayed to let the server fully initialise
    setTimeout(async () => {
      await this._runSafeCycle({ snapshotType: 'BOOT', triggeredBy: 'boot' });

      // Recurring cycles
      _intervalHandle = setInterval(async () => {
        await this._runSafeCycle({ snapshotType: 'SCHEDULED', triggeredBy: 'scheduler' });
      }, SYNC_INTERVAL_MS);

    }, BOOT_DELAY_MS);
  },

  stop() {
    if (_intervalHandle) {
      clearInterval(_intervalHandle);
      _intervalHandle = null;
    }
    _started = false;
    logger.info('[TreasuryBalanceSyncWorker] Stopped.');
  },

  /**
   * Trigger a manual sync cycle (e.g. from admin API).
   * @param {string} triggeredBy  - 'admin:<userId>'
   * @returns {Promise<object>}
   */
  async triggerManualSync(triggeredBy = 'manual') {
    logger.info(`[TreasuryBalanceSyncWorker] Manual sync triggered by: ${triggeredBy}`);
    return this._runSafeCycle({ snapshotType: 'MANUAL', triggeredBy });
  },

  async _runSafeCycle(options) {
    try {
      return await TreasuryMonitor.runCycle(options);
    } catch (err) {
      logger.error(`[TreasuryBalanceSyncWorker] Unhandled cycle error: ${err.message}`);
      return { error: err.message };
    }
  },
};

module.exports = TreasuryBalanceSyncWorker;
