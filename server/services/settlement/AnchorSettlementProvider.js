'use strict';

const ISettlementProviderV1 = require('./ISettlementProviderV1');
const logger = require('../../utils/logger');

class AnchorSettlementProvider extends ISettlementProviderV1 {
  getProviderId() {
    return 'ANCHOR';
  }

  getCapabilities() {
    return {
      supports_deposits: true,
      supports_withdrawals: true,
      supports_custody: true,
      supports_fiat: true,
      supports_swap: false,
      supports_internal_transfer: false
    };
  }

  async getCustodyBalances() {
    return [{
      provider: 'ANCHOR',
      currency: 'USD',
      available: 10000.0,
      pending: 0,
      locked: 0,
      last_synced_at: new Date()
    }];
  }

  async createPayout({ address, amount, currency, reference }) {
    logger.info(`[AnchorSettlementProvider] Payout request to ${address}, Amount: ${amount} ${currency}`);
    return {
      success: true,
      payoutId: `anchor_payout_${Date.now()}`,
      status: 'PROCESSING',
      provider: 'ANCHOR'
    };
  }

  async verifyWebhookSignature(headers, payload) {
    return true;
  }

  async getRateQuote(fromCurrency, toCurrency, amount = 1) {
    return 1.0;
  }
}

module.exports = new AnchorSettlementProvider();
