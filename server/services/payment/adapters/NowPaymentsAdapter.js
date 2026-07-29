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
    const secret = process.env.NOWPAYMENTS_IPN_SECRET || this.config('NOWPAYMENTS_WEBHOOK_SECRET') || process.env.NOWPAYMENTS_API_KEY;
    const signature = headers['x-nowpayments-sig'] || headers['x-nowpayments-signature'];
    if (!signature || !secret) return false;

    try {
      // NOWPayments IPN signature: HMAC-SHA512 of JSON stringified body with sorted keys
      let payload = rawBody;
      if (typeof rawBody === 'object') {
        const sorted = {};
        Object.keys(rawBody).sort().forEach(key => {
          sorted[key] = rawBody[key];
        });
        payload = JSON.stringify(sorted);
      }

      const expected = crypto.createHmac('sha512', secret)
        .update(payload)
        .digest('hex');

      return signature.toLowerCase() === expected.toLowerCase();
    } catch {
      return false;
    }
  }

  parseWebhookEvent(body) {
    const paymentStatus = String(body?.payment_status || body?.status || '').toLowerCase();
    const isFinished    = ['finished', 'confirmed'].includes(paymentStatus);
    const isFailed      = ['failed', 'expired', 'refunded'].includes(paymentStatus);

    return {
      type:               paymentStatus,
      reference:          body?.order_id || body?.payment_id || '',
      providerReference:  String(body?.payment_id || body?.id || ''),
      status:             isFinished ? 'COMPLETED' : isFailed ? 'FAILED' : 'PENDING',
      rawStatus:          paymentStatus,
      amount:             Number(body?.actually_paid || body?.pay_amount || body?.price_amount || 0),
      currency:           String(body?.pay_currency || body?.price_currency || 'USDT').toUpperCase(),
      outcomeAmount:      Number(body?.outcome_amount || body?.actually_paid || 0),
      outcomeCurrency:    String(body?.outcome_currency || body?.pay_currency || 'USDT').toUpperCase(),
      transactionHash:    body?.txid || body?.hash || null,
      raw:                body,
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
