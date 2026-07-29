/**
 * FincraAdapter.js
 * ================
 * Gateway Abstraction Layer adapter for Fincra.
 * Delegates to the existing FincraProvider for all SDK calls.
 * Implements the BasePaymentAdapter interface.
 *
 * Supported: NGN, USD, EUR, GBP (native) | card, bank_transfer, DVA, subscription
 *
 * NoteStandard Financial Platform v4
 */

const BasePaymentAdapter = require('./BasePaymentAdapter');
const FincraProvider = require('../providers/FincraProvider');
const crypto = require('crypto');
const logger = require('../../../utils/logger');

class FincraAdapter extends BasePaymentAdapter {
  constructor() {
    super('fincra');
    this._provider = new FincraProvider();
  }

  async initializePayment({ email, amount, currency, reference, callbackUrl, metadata }) {
    const result = await this._provider.initialize({
      email, amount, currency, reference, callbackUrl, metadata,
    });
    return {
      checkoutUrl:       result.checkoutUrl || result.link,
      providerReference: result.providerReference || result.reference || reference,
    };
  }

  async verifyPayment(reference) {
    return this._provider.verify(reference);
  }

  async refundPayment(reference, amount, reason) {
    // Fincra does not support programmatic refunds at this time
    logger.warn(`[FincraAdapter] Refund requested for ${reference} — Fincra requires manual refund processing`);
    return { success: false, refundReference: null, note: 'Fincra requires manual refund processing via dashboard' };
  }

  async createCustomer(params) {
    logger.info(`[FincraAdapter] createCustomer: ${params.email}`);
    return { customerId: params.email }; // Fincra uses email as identifier
  }

  async createVirtualAccount(params) {
    const result = await this._provider.createVirtualAccount?.(params) || {};
    return result;
  }

  async createSubscription(params) {
    // Fincra does not natively support subscriptions — handled by our subscription engine
    return { subscriptionId: null, status: 'managed_internally' };
  }

  verifyWebhookSignature(headers, rawBody) {
    const secret = this.config('FINCRA_WEBHOOK_SECRET');
    const signature = headers['x-fincra-signature'] || headers['signature'];
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return signature === expected;
  }

  parseWebhookEvent(body) {
    const event = body?.event || body?.type || '';
    const data  = body?.data  || body?.payload || {};
    return {
      type:      event,
      reference: data.merchantReference || data.reference || '',
      status:    data.status  || '',
      amount:    Number(data.amount || 0),
      currency:  String(data.currency || 'NGN').toUpperCase(),
      raw:       body,
    };
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const { dispatchFincraRequest } = require('../../fincra/gatewayClient');
      const baseUrl = this.config('FINCRA_BASE_URL') || 'https://sandboxapi.fincra.com';
      const apiKey = this.config('FINCRA_API_KEY');
      const response = await dispatchFincraRequest({
        method: 'GET',
        path: '/core/businesses/me',
        headers: { 'api-key': apiKey },
        targetUrl: baseUrl
      });
      if (response.status < 500) {
        return { status: 'HEALTHY', latencyMs: Date.now() - start };
      }
      return { status: 'DEGRADED', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DOWN', latencyMs: Date.now() - start };
    }
  }

  // ── Phase 17: Unified payout, reversal, and balance methods ────────────────

  async createTransfer(params) {
    const result = await this._provider.initiateWithdrawal?.({
      amount:        params.amount,
      currency:      params.currency,
      accountNumber: params.accountNumber,
      bankCode:      params.bankCode,
      accountName:   params.accountName,
      narration:     params.narration || 'Payout',
      reference:     params.correlationId,
      beneficiaryType: 'individual',
    }) || {};
    return {
      success:           result.success !== false,
      reference:         params.correlationId,
      providerReference: result.reference || result.data?.reference || params.correlationId,
    };
  }

  async reverseTransfer(reference, reason) {
    // Fincra requires manual reversal — returns pending manual review status
    logger.warn(`[FincraAdapter] reverseTransfer requested for ${reference} — Fincra requires manual reversal via dashboard`);
    return { success: false, reversalReference: reference, note: 'Fincra requires manual reversal via dashboard' };
  }

  async balanceInquiry(currency) {
    try {
      const { dispatchFincraRequest } = require('../../fincra/gatewayClient');
      const baseUrl = this.config('FINCRA_BASE_URL') || 'https://sandboxapi.fincra.com';
      const apiKey  = this.config('FINCRA_API_KEY');
      const businessId = this.config('FINCRA_BUSINESS_ID');
      const resp = await dispatchFincraRequest({
        method: 'GET',
        path:   `/wallets?businessId=${businessId}&currency=${String(currency).toUpperCase()}`,
        headers: { 'api-key': apiKey },
        targetUrl: baseUrl,
      });
      const wallet = resp?.data?.data?.[0] || {};
      return {
        available: parseFloat(wallet.availableBalance || wallet.balance || 0),
        pending:   parseFloat(wallet.pendingBalance   || 0),
        currency:  String(currency).toUpperCase(),
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return { available: 0, pending: 0, currency: String(currency).toUpperCase(), updatedAt: new Date().toISOString() };
    }
  }
}

module.exports = new FincraAdapter();
