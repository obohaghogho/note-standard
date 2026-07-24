/**
 * AnchorAdapter.js
 * ================
 * Gateway Abstraction Layer adapter for Anchor BaaS.
 * Delegates to the existing AnchorProvider for SDK calls.
 * Implements the BasePaymentAdapter interface.
 *
 * Supported: NGN, USD (native) | DVA, bank_transfer, payouts
 *
 * NoteStandard Financial Platform v4
 */

const BasePaymentAdapter = require('./BasePaymentAdapter');
const AnchorProvider = require('../providers/AnchorProvider');
const crypto = require('crypto');

class AnchorAdapter extends BasePaymentAdapter {
  constructor() {
    super('anchor');
    this._provider = new AnchorProvider();
  }

  async initializePayment({ email, amount, currency, reference, callbackUrl, metadata }) {
    const result = await this._provider.initialize?.({
      email, amount, currency, reference, callbackUrl, metadata,
    }) || {};
    return {
      checkoutUrl:       result.checkoutUrl || null,
      providerReference: result.providerReference || reference,
    };
  }

  async verifyPayment(reference) {
    return this._provider.verify?.(reference) || { success: false, status: 'UNKNOWN' };
  }

  async refundPayment(reference, amount, reason) {
    return { success: false, refundReference: null, note: 'Anchor refunds are handled via payout reversal' };
  }

  async createCustomer(params) {
    const result = await this._provider.createCustomer?.(params) || {};
    return { customerId: result.customerId || params.email };
  }

  async createVirtualAccount(params) {
    const result = await this._provider.createVirtualAccount?.(params) || {};
    return result;
  }

  async createSubscription(params) {
    return { subscriptionId: null, status: 'not_supported' };
  }

  verifyWebhookSignature(headers, rawBody) {
    const secret = this.config('ANCHOR_WEBHOOK_SECRET');
    const signature = headers['x-anchor-signature'] || headers['anchor-signature'];
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return signature === expected;
  }

  parseWebhookEvent(body) {
    const event = body?.type || body?.event || '';
    const data  = body?.data || {};
    return {
      type:      event,
      reference: data.reference || data.id || '',
      status:    data.status    || '',
      amount:    Number(data.amount || 0) / 100, // Anchor uses kobo/cents
      currency:  String(data.currency || 'NGN').toUpperCase(),
      raw:       body,
    };
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const axios = require('axios');
      const baseUrl = this.config('ANCHOR_BASE_URL') || 'https://sandbox.api.getanchor.co';
      const apiKey  = this.config('ANCHOR_API_KEY');
      await axios.get(`${baseUrl}/api/v1/me`, {
        headers: { 'x-anchor-key': apiKey },
        timeout: 5000,
      });
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DOWN', latencyMs: Date.now() - start };
    }
  }
}

module.exports = new AnchorAdapter();
