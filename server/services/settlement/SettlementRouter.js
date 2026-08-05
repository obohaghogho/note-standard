'use strict';

/**
 * server/services/settlement/SettlementRouter.js
 * =================================================
 * Decoupled Settlement Router.
 * Handles FX conversion, external payouts, settlement clearance, and treasury rebalancing.
 */

const logger = require('../../utils/logger');
const GreySettlementProviderV1 = require('./GreySettlementProviderV1');

class SettlementRouter {
  constructor() {
    this.settlementProviders = new Map();
    this._registerDefaultProviders();
  }

  _registerDefaultProviders() {
    const grey = new GreySettlementProviderV1();
    this.settlementProviders.set(grey.getProviderId().toLowerCase(), grey);
  }

  getSettlementProvider(providerId = 'grey') {
    const id = String(providerId).toLowerCase();
    return this.settlementProviders.get(id) || this.settlementProviders.get('grey');
  }

  async executePayout(payoutData) {
    const provider = this.getSettlementProvider(payoutData.provider || 'grey');
    logger.info(`[SettlementRouter] Routing payout via ${provider.getProviderId()}`);
    return provider.createPayout(payoutData);
  }
}

module.exports = new SettlementRouter();
