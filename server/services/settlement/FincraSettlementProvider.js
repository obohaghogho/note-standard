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

  /**
   * Execute or simulate an outbound Fincra platform settlement payout.
   *
   * When ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION=true, delegates directly to
   * Fincra gateway client POST /disbursements/payouts.
   *
   * @param {Object} params
   * @param {string} params.address   - Approved destination merchant account number
   * @param {number} params.amount    - Payout amount
   * @param {string} params.currency  - Currency ('NGN', 'USD', 'GHS')
   * @param {string} params.reference - Deterministic customerReference (= idempotencyKey)
   */
  async createPayout({ address, amount, currency, reference }) {
    logger.info(`[FincraSettlementProvider] Payout request to ${address}, Amount: ${amount} ${currency}, Ref: ${reference}`);

    if (process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION === 'true') {
      const { instance, businessId } = getFincraClient();

      if (!businessId) {
        throw new Error('Fincra settlement unavailable: FINCRA business ID is not configured');
      }

      const cur = (currency || 'NGN').toUpperCase();

      const payload = {
        sourceCurrency: cur,
        destinationCurrency: cur,
        amount: parseFloat(amount),
        business: businessId,
        description: `NoteStandard platform revenue settlement ${reference}`,
        customerReference: reference,
        paymentDestination: "bank_account",
        beneficiary: {
          name: "NoteStandard Revenue Account",
          accountNumber: address,
          type: "corporate",
          bankCode: process.env.FINCRA_BANK_CODE || "033"
        }
      };

      const res = await instance.post('/disbursements/payouts', payload);
      const fincraRef = res.data?.data?.reference || res.data?.data?.id || res.data?.reference || reference;

      logger.info(`[FincraSettlementProvider] Real Fincra payout dispatched. Ref: ${reference}, FincraRef: ${fincraRef}`);

      return {
        success: true,
        payoutId: fincraRef,
        fincraRef,
        status: 'PROCESSING',
        provider: 'FINCRA',
        rawResponse: res.data
      };
    }

    // Simulated test mode — return safe non-live response
    return {
      success: true,
      payoutId: reference || `fincra_payout_${Date.now()}`,
      status: 'PROCESSING',
      provider: 'FINCRA'
    };
  }

  /**
   * Check payout status from Fincra by customerReference (for reconciliation).
   *
   * @param {string} reference - NoteStandard customerReference
   */
  async getPayoutSettlementStatus(reference) {
    try {
      const { instance } = getFincraClient();
      const res = await instance.get(`/disbursements/payouts/customer-reference/${reference}`);
      const data = res.data?.data || res.data || {};
      const status = (data.status || '').toLowerCase();

      const isSettled = status === 'successful' || status === 'completed' || status === 'approved';
      const isFailed = status === 'failed' || status === 'rejected' || status === 'cancelled';

      return {
        isSettled,
        isFailed,
        status: status || 'pending',
        fincraRef: data.reference || data.id || null,
        raw: data,
      };
    } catch (err) {
      logger.warn(`[FincraSettlementProvider] Failed to check payout status for ${reference}: ${err.message}`);
      return { isSettled: false, isFailed: false, status: 'unknown', error: err.message };
    }
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
