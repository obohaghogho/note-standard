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
      const axios = require('axios');
      const baseUrl = this.config('FINCRA_BASE_URL') || 'https://sandboxapi.fincra.com';
      const apiKey = this.config('FINCRA_API_KEY');
      await axios.get(`${baseUrl}/core/businesses/me`, {
        headers: { 'api-key': apiKey },
        timeout: 5000,
      });
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DOWN', latencyMs: Date.now() - start };
    }
  }
}

module.exports = new FincraAdapter();
