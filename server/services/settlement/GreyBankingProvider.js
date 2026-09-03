'use strict';

const IBankingProvider = require('./IBankingProvider');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const supabase = require('../../config/database');

/**
 * GreyBankingProvider
 * ====================
 * Enterprise Banking Provider Adapter for Grey Business Lead Bank Virtual USD Checking Account.
 *
 * Operational Realities & Capabilities:
 *  - Virtual USD Checking Account with Lead Bank
 *  - ACH Receiving (Lower cost, 1-2 day settlement)
 *  - Domestic Wire Receiving (Higher priority, same-day settlement)
 *  - NO SWIFT Support (Domestic US transfers only in USD)
 *  - External Bank Payouts, FX Swaps, P2P Transfers
 *  - Provider Fee Accounting (ACH & Wire incoming fees recorded explicitly)
 */
class GreyBankingProvider extends IBankingProvider {
  constructor() {
    super();
    this.apiKey = (process.env.GREY_API_KEY || process.env.GREY_SECRET_KEY || '').trim();
    this.webhookSecret = (process.env.GREY_WEBHOOK_SECRET || 'grey_whsec_notestandard_live_2026').trim();

    // Correct base URL per Grey Finance Business API spec:
    //   Sandbox:    https://businessapi-sandbox.grey.co
    //   Production: https://businessapi.grey.co
    const greyEnv = (process.env.GREY_ENV || 'production').toLowerCase();
    const defaultBase = greyEnv === 'sandbox'
      ? 'https://businessapi-sandbox.grey.co'
      : 'https://businessapi.grey.co';
    this.baseUrl = (process.env.GREY_BASE_URL || defaultBase).trim();
    this.timeoutMs = 30000;

    // Dynamic Lead Bank USD Account Credentials from Environment Configuration
    this.accountHolder = (process.env.GREY_LEAD_BANK_HOLDER || 'JOSSY DIGITAL TECHNOLOGIES LTD').trim();
    this.bankName = (process.env.GREY_LEAD_BANK_NAME || 'Lead Bank').trim();
    this.accountNumber = (process.env.GREY_LEAD_BANK_ACCOUNT_NUMBER || '217394889898').trim();
    this.achRouting = (process.env.GREY_LEAD_BANK_ACH_ROUTING || '101019644').trim();
    this.wireRouting = (process.env.GREY_LEAD_BANK_WIRE_ROUTING || '101019644').trim();
    this.bankAddress = (process.env.GREY_LEAD_BANK_ADDRESS || '1801 Main St., Kansas City, MO 64108').trim();
    this.achFee = Number(process.env.GREY_ACH_INCOMING_FEE || 2.00);
    this.wireFee = Number(process.env.GREY_WIRE_INCOMING_FEE || 15.00);
    this.accountType = 'Checking';
    this.country = 'US';

    // Circuit Breaker State
    this.failureCount = 0;
    this.circuitOpen = false;
    this.circuitResetTime = 0;
    this.MAX_FAILURES = 5;
    this.CIRCUIT_RESET_MS = 60000;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        // Grey Business API: Bearer <secret_key> (starts with gbsk_)
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.client.interceptors.response.use(
      (res) => { this.failureCount = 0; return res; },
      (err) => { this._recordFailure(); return Promise.reject(err); }
    );
  }

  getProviderId() {
    return 'grey';
  }

  getCapabilities() {
    return {
      providerId: 'grey',
      name: 'Grey Finance (Lead Bank USD)',
      bankName: this.bankName,
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
      supportsACH: true,
      supportsWire: true,
      supportsSWIFT: false,
      supportsFX: true,
      supportsP2P: true,
      supportsVirtualAccounts: true,
      supportsUserWithdrawals: false,
      supportsWebhook: true,
      dailySettlementLimitUsd: 100000.0,
      requiresIdempotencyKey: true,
      isCustodial: true
    };
  }

  _checkCircuit() {
    if (this.circuitOpen) {
      if (Date.now() > this.circuitResetTime) {
        this.circuitOpen = false;
        this.failureCount = 0;
      } else {
        throw new Error('[GreyBankingProvider] Circuit breaker is OPEN. Provider temporarily unavailable.');
      }
    }
  }

  _recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.MAX_FAILURES) {
      this.circuitOpen = true;
      this.circuitResetTime = Date.now() + this.CIRCUIT_RESET_MS;
      logger.error(`[GreyBankingProvider] Circuit Breaker OPENED! Failure count=${this.failureCount}`);
    }
  }

  async _executeWithRetry(fn, retries = 3) {
    this._checkCircuit();
    let delay = 500;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const isClientError = err.response && err.response.status >= 400 && err.response.status < 500;
        if (isClientError || attempt === retries) {
          throw this._normalizeError(err);
        }
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  _normalizeError(error) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || {};
    const message = errorData.message || errorData.error || error.message || 'Grey Banking error';

    const normalized = new Error(`[Grey] ${message}`);
    normalized.statusCode = status;
    normalized.provider = 'grey';
    normalized.details = errorData;
    return normalized;
  }

  /**
   * Dynamically fetch account details
   */
  async getAccountDetails(params = {}) {
    return {
      providerId: 'grey',
      accountHolder: this.accountHolder,
      bankName: this.bankName,
      accountNumber: this.accountNumber,
      achRouting: this.achRouting,
      wireRouting: this.wireRouting,
      bankAddress: this.bankAddress,
      accountType: this.accountType,
      country: this.country,
      currency: 'USD',
      achFee: this.achFee,
      wireFee: this.wireFee,
      supportedRails: ['ACH', 'WIRE'],
      unsupportedRails: ['SWIFT']
    };
  }

  /**
   * Dynamic Deposit Instruction Generator returning unified contract with persistent reference
   */
  async createDepositInstructions({ currency = 'USD', rail = 'ACH', userId }) {
    const details = await this.getAccountDetails();
    const UserBankReferenceService = require('../payment/UserBankReferenceService');
    const persistentRef = await UserBankReferenceService.getOrCreateUserReference(userId, 'grey');
    const isWire = String(rail).toUpperCase() === 'WIRE';

    return {
      provider: {
        name: 'GREY',
        bank_partner: details.bankName || 'Lead Bank'
      },
      account: {
        holder: details.accountHolder,
        number: details.accountNumber,
        type: details.accountType || 'Checking',
        ach_routing: details.achRouting,
        wire_routing: details.wireRouting,
        address: details.bankAddress
      },
      reference: {
        code: persistentRef,
        persistent: true
      },
      limits: {
        minimum: isWire ? 100 : 10,
        maximum: isWire ? 500000 : 50000
      },
      supported: {
        ach: true,
        wire: true,
        swift: false
      },
      fees: {
        ach: details.achFee || 2.00,
        wire: details.wireFee || 15.00
      },
      notices: [
        'Only send USD from a US bank account.',
        'ACH transfers typically take 1-2 business days.',
        'Include your unique reference in the transfer memo.',
        'Do not send from non-US banks or via SWIFT (not supported).',
        'Payments without reference may be delayed or require manual review.'
      ]
    };
  }

  /**
   * Fetch incoming ACH & Wire transactions from Grey API
   * GET /api/v1/transactions?type=deposit
   */
  async getIncomingTransfers(params = {}) {
    return this._executeWithRetry(async () => {
      const response = await this.client.get('/api/v1/transactions', {
        params: { limit: params.limit || 50, page: params.page || 1 }
      }).catch(() => ({ data: { data: [] } }));

      const list = response.data?.data || [];
      return list.map(t => ({
        providerTxId: t.transaction_id || t.id || t.transaction_reference,
        providerReference: t.transaction_reference || t.id,
        clientReference: t.client_reference || null,
        amount: Number(t.source_amount || t.amount || 0),
        currency: String(t.source_currency || t.currency || 'USD').toUpperCase(),
        destinationAmount: Number(t.destination_amount || 0),
        destinationCurrency: String(t.destination_currency || '').toUpperCase(),
        rail: String(t.rail || t.type || t.transaction_type || 'ACH').toUpperCase(),
        senderName: t.sender?.name || t.sender_name || t.narration || 'Unknown Sender',
        senderBank: t.sender?.bank_name || '',
        senderAccount: t.sender?.account_number || t.sender_account || '',
        memo: t.memo || t.narration || t.description || '',
        fee: Number(t.fees || t.fee || 0),
        status: ['completed', 'success'].includes(String(t.status).toLowerCase()) ? 'SETTLED' : 'PENDING_SETTLEMENT',
        createdAt: t.created_at || new Date().toISOString(),
        completedAt: t.completed_at || null
      }));
    });
  }

  /**
   * Verify Webhook Signature per Grey Business API spec.
   * Header: X-Webhook-Signature: sha256=<hex>
   */
  async verifyWebhook(headers, payload) {
    try {
      const sigHeader = headers['x-webhook-signature'] || headers['x-grey-signature'] || headers['signature'] || '';

      if (!sigHeader) {
        if (process.env.NODE_ENV === 'development' && !this.webhookSecret) {
          return true;
        }
        return false;
      }

      // Strip "sha256=" prefix per Grey spec
      const signature = sigHeader.startsWith('sha256=')
        ? sigHeader.slice(7)
        : sigHeader;

      const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const computed = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      let isValidSig = false;
      try {
        isValidSig = crypto.timingSafeEqual(
          Buffer.from(signature, 'hex'),
          Buffer.from(computed, 'hex')
        );
      } catch {
        isValidSig = false;
      }

      if (!isValidSig) return false;

      // Event Deduplication using Grey's canonical transaction_reference
      const eventId =
        payload.transaction_reference ||
        payload.transaction_id ||
        payload.client_reference ||
        payload.id;

      if (eventId) {
        const { data: existing } = await supabase
          .from('webhook_events')
          .select('id')
          .eq('event_id', String(eventId))
          .maybeSingle();

        if (existing) {
          logger.info(`[GreyBankingProvider] Webhook ${eventId} already processed. Ignored.`);
          return false;
        }
      }

      return true;
    } catch (e) {
      logger.error(`[GreyBankingProvider] Webhook verification error: ${e.message}`);
      return false;
    }
  }

  async getBalance(currency = null) {
    return this._executeWithRetry(async () => {
      const response = await this.client.get('/v1/balances').catch(() => ({ data: { data: { balances: [] } } }));
      // Grey Business API balance shape: { data: { balances: [ { currency, available_balance, pending_balance } ] } }
      const balances =
        response.data?.data?.balances ||
        response.data?.data ||
        response.data?.balances ||
        (Array.isArray(response.data) ? response.data : []);

      if (currency) {
        const up = currency.toUpperCase();
        const found = balances.find(b => String(b.currency).toUpperCase() === up);
        return {
          currency: up,
          balance: found ? Number(found.available_balance ?? found.balance ?? 0) : 0.0,
          availableBalance: found ? Number(found.available_balance ?? 0) : 0.0,
          pendingBalance: found ? Number(found.pending_balance ?? 0) : 0.0
        };
      }

      return balances.map(b => ({
        currency: String(b.currency).toUpperCase(),
        balance: Number(b.available_balance ?? b.balance ?? 0),
        availableBalance: Number(b.available_balance ?? 0),
        pendingBalance: Number(b.pending_balance ?? 0)
      }));
    });
  }

  async createPayout(payoutData) {
    const GreySettlementProvider = require('./GreySettlementProvider');
    const p = new GreySettlementProvider();
    return p.createPayout(payoutData);
  }

  /**
   * Health Check — uses GET /v1/balances as liveness probe.
   * Grey Business API has no dedicated /v1/health endpoint.
   */
  async healthCheck() {
    const start = Date.now();
    try {
      if (this.circuitOpen) {
        return { status: 'DEGRADED', latencyMs: 0, message: 'Circuit breaker is OPEN' };
      }
      const r = await this.client.get('/v1/balances');
      const latencyMs = Date.now() - start;
      const ok = r.status >= 200 && r.status < 300;
      return {
        status: ok ? 'HEALTHY' : 'DEGRADED',
        latencyMs,
        message: ok ? 'Grey Lead Bank Banking API operational' : `Unexpected status ${r.status}`
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return { status: 'UNHEALTHY', latencyMs, message: err.message };
    }
  }
}

module.exports = GreyBankingProvider;
