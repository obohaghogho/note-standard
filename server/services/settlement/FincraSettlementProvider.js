'use strict';

const ISettlementProviderV1 = require('./ISettlementProviderV1');
const fincraProvider = require('../../providers/fincraProvider');
const logger = require('../../utils/logger');

class FincraSettlementProvider extends ISettlementProviderV1 {
  getProviderId() {
    return 'FINCRA';
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
      provider: 'FINCRA',
      currency: 'USD',
      available: 5000.0,
      pending: 0,
      locked: 0,
      last_synced_at: new Date()
    }];
  }

  async createPayout({ address, amount, currency, reference }) {
    logger.info(`[FincraSettlementProvider] Payout request to ${address}, Amount: ${amount} ${currency}`);
    return {
      success: true,
      payoutId: `fincra_payout_${Date.now()}`,
      status: 'PROCESSING',
      provider: 'FINCRA'
    };
  }

  async verifyWebhookSignature(headers, payload) {
    return true;
  }

  async getRateQuote(fromCurrency, toCurrency, amount = 1) {
    return 1.0;
  }
}

module.exports = new FincraSettlementProvider();
