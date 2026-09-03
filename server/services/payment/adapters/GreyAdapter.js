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
      const greyEnv = (process.env.GREY_ENV || 'production').toLowerCase();
      const defaultBase = greyEnv === 'sandbox'
        ? 'https://businessapi-sandbox.grey.co'
        : 'https://businessapi.grey.co';
      const baseUrl = this.config('GREY_BASE_URL') || defaultBase;
      const apiKey  = this.config('GREY_API_KEY') || this.config('GREY_SECRET_KEY');
      // Grey Business API has no /v1/ping — use /v1/balances as liveness probe
      const r = await axios.get(`${baseUrl}/v1/balances`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      });
      const ok = r.status >= 200 && r.status < 300;
      return { status: ok ? 'HEALTHY' : 'DEGRADED', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DOWN', latencyMs: Date.now() - start };
    }
  }

  // ── Phase 17: Unified payout, reversal, and balance methods ────────────────

  async createTransfer(params) {
    const result = await this._provider.initiateTransfer?.({
      amount:        params.amount,
      currency:      params.currency,
      accountNumber: params.accountNumber,
      bankCode:      params.bankCode,
      accountName:   params.accountName,
      narration:     params.narration || 'Payout',
      reference:     params.correlationId,
    }) || {};
    return {
      success:           result.success !== false,
      reference:         params.correlationId,
      providerReference: result.reference || result.transferId || params.correlationId,
    };
  }

  async reverseTransfer(reference, reason) {
    // Grey does not support programmatic reversals
    const logger = require('../../../utils/logger');
    logger.warn(`[GreyAdapter] reverseTransfer requested for ${reference} — Grey requires manual reversal`);
    return { success: false, reversalReference: reference, note: 'Grey requires manual reversal' };
  }

  async balanceInquiry(currency) {
    try {
      const axios    = require('axios');
      const greyEnv  = (process.env.GREY_ENV || 'production').toLowerCase();
      const defaultBase = greyEnv === 'sandbox'
        ? 'https://businessapi-sandbox.grey.co'
        : 'https://businessapi.grey.co';
      const baseUrl  = this.config('GREY_BASE_URL') || defaultBase;
      const apiKey   = this.config('GREY_API_KEY') || this.config('GREY_SECRET_KEY');
      const up       = String(currency).toUpperCase();
      const { data } = await axios.get(`${baseUrl}/v1/balances`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 8000,
      });
      // Grey Business API: { data: { balances: [{ currency, available_balance, pending_balance }] } }
      const balances = data?.data?.balances || data?.data || data?.balances || [];
      const found = Array.isArray(balances)
        ? balances.find(b => String(b.currency).toUpperCase() === up)
        : null;
      return {
        available: parseFloat(found?.available_balance ?? found?.balance ?? 0),
        pending:   parseFloat(found?.pending_balance   ?? 0),
        currency:  up,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return { available: 0, pending: 0, currency: String(currency).toUpperCase(), updatedAt: new Date().toISOString() };
    }
  }
}

module.exports = new GreyAdapter();
