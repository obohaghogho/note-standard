/**
 * NowPaymentsAdapter.js
 * =====================
 * Gateway Abstraction Layer adapter for NowPayments (crypto).
 * Delegates to the existing NowPaymentsProvider for SDK calls.
 * Implements the BasePaymentAdapter interface.
 *
 * Supported: BTC, ETH, USDT, USDC, MATIC, XRP | crypto method
 *
 * NoteStandard Financial Platform v4
 */

const BasePaymentAdapter = require('./BasePaymentAdapter');
const NowPaymentsProvider = require('../providers/NowPaymentsProvider');
const crypto = require('crypto');

class NowPaymentsAdapter extends BasePaymentAdapter {
  constructor() {
    super('nowpayments');
    this._provider = new NowPaymentsProvider();
  }

  async initializePayment({ email, amount, currency, reference, callbackUrl, metadata }) {
    const result = await this._provider.initialize({
      email, amount, currency, reference, callbackUrl, metadata,
    });
    return {
      checkoutUrl:       result.checkoutUrl || result.invoice_url,
      providerReference: result.providerReference || result.id || reference,
    };
  }

  async verifyPayment(reference) {
    return this._provider.verify(reference);
  }

  async refundPayment(reference, amount, reason) {
    // NowPayments does not support refunds
    return { success: false, refundReference: null, note: 'Crypto payments are non-refundable via NowPayments' };
  }

  async createCustomer(params) {
    return { customerId: params.email };
  }

  async createVirtualAccount(params) {
    // NowPayments creates deposit addresses, not traditional virtual accounts
    return { accountNumber: null, note: 'Use initializePayment for crypto deposit addresses' };
  }

  async createSubscription(params) {
    return { subscriptionId: null, status: 'not_supported' };
  }

  verifyWebhookSignature(headers, rawBody) {
    const secret = this.config('NOWPAYMENTS_WEBHOOK_SECRET');
    const signature = headers['x-nowpayments-sig'];
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha512', secret)
      .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
      .digest('hex');
    return signature === expected;
  }

  parseWebhookEvent(body) {
    return {
      type:      body?.payment_status || '',
      reference: body?.order_id       || body?.payment_id || '',
      status:    body?.payment_status || '',
      amount:    Number(body?.pay_amount || body?.price_amount || 0),
      currency:  String(body?.pay_currency || body?.price_currency || 'USDT').toUpperCase(),
      raw:       body,
    };
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const axios = require('axios');
      const apiKey = this.config('NOWPAYMENTS_API_KEY');
      await axios.get('https://api.nowpayments.io/v1/status', {
        headers: { 'x-api-key': apiKey },
        timeout: 5000,
      });
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DOWN', latencyMs: Date.now() - start };
    }
  }
}

module.exports = new NowPaymentsAdapter();
