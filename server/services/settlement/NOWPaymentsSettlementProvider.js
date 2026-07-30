'use strict';

const ISettlementProviderV1 = require('./ISettlementProviderV1');
const nowpaymentsProvider = require('../../providers/nowpaymentsProvider');
const logger = require('../../utils/logger');
const crypto = require('crypto');

class NOWPaymentsSettlementProvider extends ISettlementProviderV1 {
  getProviderId() {
    return 'NOWPAYMENTS';
  }

  getCapabilities() {
    return {
      supports_deposits: true,
      supports_withdrawals: true,
      supports_custody: true,
      supports_fiat: false,
      supports_swap: true,
      supports_internal_transfer: false
    };
  }

  async getCustodyBalances() {
    const NowPaymentsBalanceFetcher = require('../treasury/fetchers/NowPaymentsBalanceFetcher');
    const rawBalances = await NowPaymentsBalanceFetcher.fetchAll();
    return rawBalances.map(b => ({
      provider: 'NOWPAYMENTS',
      currency: b.currency,
      available: b.available_balance,
      pending: b.pending_balance,
      locked: 0,
      last_synced_at: new Date()
    }));
  }

  async createPayout({ address, amount, currency, network = 'NATIVE', reference }) {
    logger.info(`[NOWPaymentsSettlementProvider] Executing payout to ${address}, Amount: ${amount} ${currency}`);
    const result = await nowpaymentsProvider.createPayout(address, amount, currency, reference, network);
    return {
      success: result.success,
      payoutId: result.payoutId,
      status: result.status,
      provider: 'NOWPAYMENTS'
    };
  }

  async verifyWebhookSignature(headers, payload) {
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!secret) return true; // Fail safe if key unconfigured in dev

    const hmacHeader = headers['x-nowpayments-sig'];
    if (!hmacHeader) return false;

    // NOWPayments IPN signature algorithm: sort keys and hash with HMAC-SHA512
    const sortedKeys = Object.keys(payload).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
      sortedObj[key] = payload[key];
    }

    const calculatedSig = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(sortedObj))
      .digest('hex');

    return calculatedSig === hmacHeader;
  }

  async getRateQuote(fromCurrency, toCurrency, amount = 1) {
    return await nowpaymentsProvider.getRate(fromCurrency, toCurrency, amount);
  }
}

module.exports = new NOWPaymentsSettlementProvider();
