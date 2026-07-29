'use strict';
/**
 * CryptoWalletVerificationWorker.js
 * =================================
 * Background worker running hourly capability synchronization and startup verification.
 * Logs enterprise readiness matrix without crashing the server.
 *
 * @module workers/CryptoWalletVerificationWorker
 */

const logger = require('../utils/logger');
const CryptoCapabilityService = require('../services/nowpayments/CryptoCapabilityService');
const supabase = require('../config/database');

let intervalId = null;

const CryptoWalletVerificationWorker = {
  start(intervalMs = 60 * 60 * 1000) {
    if (intervalId) return;
    logger.info('[CryptoWalletVerificationWorker] Starting worker...');

    intervalId = setInterval(() => {
      this.verifyAndLog().catch(err => logger.error(`[CryptoWalletVerificationWorker] Error: ${err.message}`));
    }, intervalMs);

    // Initial boot verification run
    setImmediate(() => this.verifyAndLog().catch(() => {}));
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  async verifyAndLog() {
    try {
      const report = await CryptoCapabilityService.syncCapabilities();

      const assetGroups = await CryptoCapabilityService.getAvailableAssetsAndNetworks();

      logger.info('====================================================');
      logger.info('          NOWPayments Enterprise Readiness          ');
      logger.info('====================================================');
      logger.info(`Provider Status: API Reachable: ${report.apiReachable ? '✓' : '✗'}, Balance API: ${report.balanceApiAccess ? '✓' : '✗'}, IPN Secret: ${report.ipnConfigured ? '✓' : '✗'}`);
      logger.info('----------------------------------------------------');
      logger.info('Network Capabilities Matrix:');

      for (const group of assetGroups) {
        for (const net of group.networks) {
          const stateStr = `${group.currency} ${net.network}`.padEnd(18);
          const state    = net.operationalState;
          const note     = net.disabledReason ? ` (${net.disabledReason})` : '';
          logger.info(`  ${stateStr} -> ${state}${note}`);
        }
      }

      logger.info('====================================================');
    } catch (err) {
      logger.error(`[CryptoWalletVerificationWorker] Verification run failed: ${err.message}`);
    }
  },
};

module.exports = CryptoWalletVerificationWorker;
