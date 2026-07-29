/**
 * PaystackAdapter.js
 * ==================
 * Gateway Abstraction Layer adapter for Paystack.
 * Delegates to the existing PaystackProvider for all SDK calls.
 * Implements the BasePaymentAdapter interface.
 *
 * Supported: NGN, USD (native) | card, DVA, subscription
 *
 * NoteStandard Financial Platform v4
 */

const BasePaymentAdapter = require('./BasePaymentAdapter');
const PaystackProvider = require('../providers/PaystackProvider');
const crypto = require('crypto');
const logger = require('../../../utils/logger');

class PaystackAdapter extends BasePaymentAdapter {
  constructor() {
    super('paystack');
    this._provider = new PaystackProvider();
  }

  async initializePayment({ email, amount, currency, reference, callbackUrl, metadata }) {
    const result = await this._provider.initialize({
      email, amount, currency, reference, callbackUrl, metadata,
    });
    return {
      checkoutUrl:       result.checkoutUrl || result.authorization_url,
      providerReference: result.providerReference || reference,
    };
  }

  async verifyPayment(reference) {
    return this._provider.verify(reference);
  }

  async refundPayment(reference, amount, reason) {
    // Paystack refund via their API
    const secretKey = this.config('PAYSTACK_SECRET_KEY');
    const axios = require('axios');
    try {
      const { data } = await axios.post(
        'https://api.paystack.co/refund',
        { transaction: reference, amount: Math.round(amount * 100), reason: reason || 'Customer request' },
        { headers: { Authorization: `Bearer ${secretKey}` }, timeout: 15000 }
      );
      return {
        success: data?.status === true,
        refundReference: data?.data?.id ? String(data.data.id) : reference,
      };
    } catch (err) {
      logger.error(`[PaystackAdapter] refundPayment failed: ${err.message}`);
      throw err;
    }
  }

  async createCustomer({ email, firstName, lastName, phone }) {
    const secretKey = this.config('PAYSTACK_SECRET_KEY');
    const axios = require('axios');
    const { data } = await axios.post(
      'https://api.paystack.co/customer',
      { email, first_name: firstName, last_name: lastName, phone },
      { headers: { Authorization: `Bearer ${secretKey}` }, timeout: 10000 }
    );
    return { customerId: data?.data?.customer_code };
  }

  async createVirtualAccount(params) {
    const result = await this._provider.createVirtualAccount(params);
    return result;
  }

  async createSubscription(params) {
    const result = await this._provider.createSubscription?.(params) || {};
    return result;
  }

  verifyWebhookSignature(headers, rawBody) {
    const secret = this.config('PAYSTACK_WEBHOOK_SECRET') || this.config('PAYSTACK_SECRET_KEY');
    const signature = headers['x-paystack-signature'];
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    return signature === expected;
  }

  parseWebhookEvent(body) {
    const event = body?.event || '';
    const data  = body?.data  || {};
    return {
      type:      event,
      reference: data.reference || '',
      status:    data.status    || '',
      amount:    (data.amount || 0) / 100,
      currency:  (data.currency || 'NGN').toUpperCase(),
      raw:       body,
    };
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const axios = require('axios');
      const secretKey = this.config('PAYSTACK_SECRET_KEY');
      await axios.get('https://api.paystack.co/bank', {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 5000,
      });
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DOWN', latencyMs: Date.now() - start };
    }
  }

  // ── Phase 17: Unified payout, reversal, and balance methods ────────────────

  async createTransfer(params) {
    const payoutService = require('../../payment/payoutService');
    const result = await payoutService.createPaystackTransfer(
      params.bankCode,
      params.accountNumber,
      params.accountName,
      params.amount,
      params.currency || 'NGN',
      params.correlationId,
      params.narration || 'Payout'
    );
    return {
      success:           result.success !== false,
      reference:         params.correlationId,
      providerReference: result.payoutId || params.correlationId,
    };
  }

  async reverseTransfer(reference, reason) {
    return this.refundPayment(reference, 0, reason).then(r => ({
      success:           r.success,
      reversalReference: r.refundReference || reference,
    })).catch(() => ({ success: false, reversalReference: reference }));
  }

  async balanceInquiry(currency) {
    try {
      const axios      = require('axios');
      const secretKey  = this.config('PAYSTACK_SECRET_KEY');
      const { data } = await axios.get('https://api.paystack.co/balance', {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 8000,
      });
      const up      = String(currency).toUpperCase();
      const account = (data?.data || []).find(b => b.currency === up) || {};
      return {
        available: (account.balance || 0) / 100,  // Paystack returns in kobo
        pending:   0,
        currency:  up,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return { available: 0, pending: 0, currency: String(currency).toUpperCase(), updatedAt: new Date().toISOString() };
    }
  }
}

module.exports = new PaystackAdapter();
