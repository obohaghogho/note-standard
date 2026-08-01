'use strict';

const ISettlementProviderV1 = require('./ISettlementProviderV1');
const { getFincraClient } = require('../fincra/client');
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
      supports_internal_transfer: false,
      settlement_aware: true,
    };
  }

  /**
   * Fetches real custody/merchant balances from Fincra API.
   */
  async getCustodyBalances() {
    try {
      const { instance, businessId } = getFincraClient();
      const res = await instance.get(`/wallets?businessId=${businessId}`);
      const rawWallets = res.data?.data || res.data || [];

      return rawWallets.map(w => ({
        provider: 'FINCRA',
        currency: (w.currency || w.symbol || '').toUpperCase(),
        available: parseFloat(w.availableBalance || w.balance || 0),
        pending: parseFloat(w.pendingBalance || 0),
        locked: parseFloat(w.ledgerBalance ? w.ledgerBalance - (w.availableBalance || 0) : 0),
        last_synced_at: new Date(),
      }));
    } catch (err) {
      logger.error(`[FincraSettlementProvider] Failed to fetch custody balances: ${err.message}`);
      return [];
    }
  }

  async createPayout({ address, amount, currency, reference }) {
    logger.info(`[FincraSettlementProvider] Payout request to ${address}, Amount: ${amount} ${currency}`);
    return {
      success: true,
      payoutId: reference || `fincra_payout_${Date.now()}`,
      status: 'PROCESSING',
      provider: 'FINCRA'
    };
  }

  async verifyWebhookSignature(headers, payload) {
    const { verifyFincraWebhookSignature } = require('../fincra/encryption');
    try {
      verifyFincraWebhookSignature(headers, typeof payload === 'string' ? payload : JSON.stringify(payload));
      return true;
    } catch (err) {
      return false;
    }
  }

  async getRateQuote(fromCurrency, toCurrency, amount = 1) {
    return 1.0;
  }

  /**
   * Check if a deposit/collection has settled on Fincra.
   *
   * @param {string} providerReference
   */
  async getDepositSettlementStatus(providerReference) {
    try {
      const { instance } = getFincraClient();
      const res = await instance.get(`/collections/verifications/${providerReference}`);
      const data = res.data?.data || res.data || {};
      const status = (data.status || '').toLowerCase();

      const isSettled = status === 'successful' || status === 'approved' || status === 'completed';

      return {
        isSettled,
        status: status || 'pending',
        settledAt: isSettled ? (data.updatedAt || new Date().toISOString()) : null,
      };
    } catch (err) {
      logger.warn(`[FincraSettlementProvider] Failed to check deposit status for ${providerReference}: ${err.message}`);
      return { isSettled: false, status: 'unknown' };
    }
  }
}

module.exports = new FincraSettlementProvider();
