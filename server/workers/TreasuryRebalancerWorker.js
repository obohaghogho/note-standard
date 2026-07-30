'use strict';

/**
 * TreasuryRebalancerWorker
 * ========================
 * Evaluates provider reserve balances across NOWPayments, Fincra, Anchor, etc.
 * Emits rebalance recommendations and triggers automated alerts when provider liquidity drops.
 */

const pool = require('../config/pgPool');
const TreasuryService = require('../services/treasury/TreasuryService');
const eventBus = require('../services/events/LocalEventBus');
const logger = require('../utils/logger');

let timer = null;

const TreasuryRebalancerWorker = {
  start(intervalMs = 15 * 60 * 1000) {
    if (timer) return;
    logger.info('[TreasuryRebalancerWorker] Starting Treasury Rebalancer Worker...');
    timer = setInterval(() => this.evaluateRebalance().catch(() => {}), intervalMs);
  },

  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },

  async evaluateRebalance() {
    try {
      const ratios = await TreasuryService.calculateReserveRatios();
      for (const r of ratios) {
        if (r.status === 'RED') {
          logger.error(`[TreasuryRebalancerWorker] RED ALERT: Reserve Ratio for ${r.currency} is ${r.reserveRatioPercent}% (Custody: ${r.custodyAsset}, Liability: ${r.userLiability})`);
          await eventBus.publish('treasury.low_liquidity', { currency: r.currency, ratio: r.reserveRatioPercent, custody: r.custodyAsset });
        }
      }
      return ratios;
    } catch (err) {
      logger.error(`[TreasuryRebalancerWorker] Rebalance evaluation error: ${err.message}`);
    }
  }
};

module.exports = TreasuryRebalancerWorker;
