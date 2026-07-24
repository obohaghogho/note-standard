/**
 * GreyAdapter.js
 * ==============
 * Gateway Abstraction Layer adapter for Grey Finance.
 * Delegates to the existing GreyProvider for SDK calls.
 * Implements the BasePaymentAdapter interface.
 *
 * Supported: USD, EUR, GBP (native) | bank_transfer, DVA
 *
 * NoteStandard Financial Platform v4
 */

const BasePaymentAdapter = require('./BasePaymentAdapter');
const GreyProvider = require('../providers/GreyProvider');
const crypto = require('crypto');

class GreyAdapter extends BasePaymentAdapter {
  constructor() {
    super('grey');
    this._provider = new GreyProvider();
  }

  async initializePayment({ email, amount, currency, reference, callbackUrl, metadata }) {
    const result = await this._provider.initialize({
      email, amount, currency, reference, callbackUrl, metadata,
    });
    return {
      checkoutUrl:       result.checkoutUrl || result.link || null,
      providerReference: result.providerReference || reference,
    };
  }

  async verifyPayment(reference) {
    return this._provider.verify(reference);
  }

  async refundPayment(reference, amount, reason) {
    // Grey does not support programmatic refunds
    return { success: false, refundReference: null, note: 'Grey requires manual refund processing' };
  }

  async createCustomer(params) {
    return { customerId: params.email };
  }

  async createVirtualAccount(params) {
    const result = await this._provider.createVirtualAccount?.(params) || {};
    return result;
  }

  async createSubscription(params) {
    return { subscriptionId: null, status: 'not_supported' };
  }

  verifyWebhookSignature(headers, rawBody) {
    const secret = this.config('GREY_WEBHOOK_SECRET');
    const signature = headers['x-grey-signature'] || headers['signature'];
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return signature === expected;
  }

  parseWebhookEvent(body) {
    const event = body?.type || body?.event || '';
    const data  = body?.data || {};
    return {
      type:      event,
      reference: data.reference || body.reference || '',
      status:    data.status    || '',
      amount:    Number(data.amount || 0),
      currency:  String(data.currency || 'USD').toUpperCase(),
      raw:       body,
    };
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const axios = require('axios');
      const baseUrl = this.config('GREY_BASE_URL') || 'https://api.grey.co';
      const apiKey  = this.config('GREY_API_KEY');
      await axios.get(`${baseUrl}/v1/ping`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DOWN', latencyMs: Date.now() - start };
    }
  }
}

module.exports = new GreyAdapter();
