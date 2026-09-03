'use strict';

const ISettlementProviderV1 = require('./ISettlementProviderV1');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const supabase = require('../../config/database');

/**
 * GreySettlementProvider
 * ======================
 * Enterprise Settlement Adapter for Grey Finance Business API.
 *
 * Operational Realities & Capabilities:
 *  - Business API P2P Transfers (/v1/payouts/p2p)
 *  - Business API Currency Conversion / Swap (/v1/fx/exchange)
 *  - External Bank Payouts (/v1/payouts)
 *  - Daily Settlement Volume Cap: $100,000 USD equivalent/day
 *  - Pure Settlement Provider: User balances remain 100% in NoteStandard double-entry ledger.
 */
class GreySettlementProvider extends ISettlementProviderV1 {
  constructor() {
    super();
    this.apiKey = (process.env.GREY_API_KEY || process.env.GREY_SECRET_KEY || '').trim();
    this.webhookSecret = (process.env.GREY_WEBHOOK_SECRET || '').trim();

    // Correct base URL per Grey Finance Business API spec:
    //   Sandbox:    https://businessapi-sandbox.grey.co
    //   Production: https://businessapi.grey.co
    const env = (process.env.GREY_ENV || 'production').toLowerCase();
    const defaultBase = env === 'sandbox'
      ? 'https://businessapi-sandbox.grey.co'
      : 'https://businessapi.grey.co';
    this.baseUrl = (process.env.GREY_BASE_URL || defaultBase).trim();
    this.timeoutMs = 30000;

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
        // Grey Business API uses Bearer <secret_key> (starts with gbsk_)
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Logging & Error Interceptor
    this.client.interceptors.response.use(
      (response) => {
        this.failureCount = 0; // reset circuit breaker on success
        return response;
      },
      (error) => {
        this._recordFailure();
        return Promise.reject(error);
      }
    );
  }

  getProviderId() {
    return 'grey';
  }

  getCapabilities() {
    return {
      providerId: 'grey',
      name: 'Grey Finance',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'NGN'],
      supportsP2P: true,
      supportsFxSwap: true,
      supportsExternalPayouts: true,
      dailySettlementLimitUsd: 100000.0,
      requiresIdempotencyKey: true,
      isCustodial: true
    };
  }

  _checkCircuit() {
    if (this.circuitOpen) {
      if (Date.now() > this.circuitResetTime) {
        logger.info('[GreySettlementProvider] Circuit breaker reset timeout passed — testing connection');
        this.circuitOpen = false;
        this.failureCount = 0;
      } else {
        throw new Error('[GreySettlementProvider] Circuit breaker is OPEN. Provider temporarily unavailable.');
      }
    }
  }

  _recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.MAX_FAILURES) {
      this.circuitOpen = true;
      this.circuitResetTime = Date.now() + this.CIRCUIT_RESET_MS;
      logger.error(`[GreySettlementProvider] Circuit Breaker OPENED! Failure count=${this.failureCount}`);
    }
  }

  /**
   * Helper to execute requests with retries and exponential backoff
   */
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
        logger.warn(`[GreySettlementProvider] Request attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  /**
   * Normalize Grey errors into standard platform errors
   */
  _normalizeError(error) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || {};
    const message = errorData.message || errorData.error || error.message || 'Grey Settlement error';

    const normalized = new Error(`[Grey] ${message}`);
    normalized.statusCode = status;
    normalized.provider = 'grey';
    normalized.details = errorData;
    return normalized;
  }

  /**
   * Create an external bank payout or P2P transfer.
   *
   * For external payouts:  POST /v1/charge/payout
   *   - source_amount, source_currency, destination_currency, beneficiary object
   *   - X-Idempotency-Key header (or reference field for idempotency)
   * For P2P transfers:     POST /v1/charge/p2p
   *   - source_amount, source_currency, destination_currency, username, description
   */
  async createPayout({ address, amount, currency, network, reference, beneficiaryId, metadata = {} }) {
    return this._executeWithRetry(async () => {
      const upCurrency = String(currency).toUpperCase();
      const destCurrency = String(metadata.destinationCurrency || currency).toUpperCase();
      const idempotencyKey = metadata.idempotencyKey || `grey_payout_${reference}`;

      // Check Daily Settlement Limit ($100k cap)
      const GreyDailyLimitService = require('../treasury/GreyDailyLimitService');
      const capCheck = await GreyDailyLimitService.checkSettlementCapacity(amount, upCurrency);

      if (!capCheck.isAvailable) {
        const capErr = new Error(`[Grey] Daily settlement capacity ($100,000 USD limit) reached. Current utilization: ${capCheck.utilizationPercentage}%. Payout queued.`);
        capErr.statusCode = 429;
        capErr.code = 'DAILY_LIMIT_EXHAUSTED';
        throw capErr;
      }

      logger.info(`[GreySettlementProvider] Initiating Payout (${upCurrency} ${amount} → ${destCurrency})`, {
        reference,
        beneficiaryId,
        idempotencyKey
      });

      let endpoint, payload;

      if (metadata.isP2p && metadata.greyTag) {
        // Grey P2P Transfer — send to a Grey user by tag
        endpoint = '/v1/charge/p2p';
        payload = {
          source_amount: Number(amount),
          source_currency: upCurrency,
          destination_currency: destCurrency,
          username: metadata.greyTag,
          description: metadata.narration || `NoteStandard P2P ${reference}`,
        };
      } else {
        // External Bank Payout via /v1/charge/payout
        // beneficiary object shape depends on destination rail — built from metadata
        const beneficiary = metadata.beneficiary || {
          first_name: metadata.firstName || metadata.first_name || 'Unknown',
          last_name: metadata.lastName || metadata.last_name || 'Recipient',
          account_number: metadata.accountNumber || address || '',
          routing_number: metadata.routingNumber || '',
          bank_name: metadata.bankName || '',
          account_type: metadata.accountType || 'checking',
          bank_country_code: metadata.bankCountryCode || 'US',
          scheme: metadata.scheme || 'ACH',
          payment_purpose: metadata.paymentPurpose || 'Business Payment',
          destination: metadata.destination || 'bank_account',
        };

        endpoint = '/v1/charge/payout';
        payload = {
          source_amount: Number(amount),
          source_currency: upCurrency,
          destination_currency: destCurrency,
          description: metadata.narration || `NoteStandard Payout ${reference}`,
          // reference also acts as idempotency key on Grey's side (see spec)
          reference: String(reference).substring(0, 128),
          beneficiary,
        };
      }

      const response = await this.client.post(endpoint, payload, {
        headers: { 'X-Idempotency-Key': idempotencyKey }
      });

      const resData = response.data?.data || response.data || {};
      const providerRef = resData.reference || resData.id || reference;
      const clientRef = resData.client_reference || reference;

      // Track settlement volume against daily limit
      await GreyDailyLimitService.recordSettlement(amount, upCurrency, reference);

      return {
        success: true,
        providerId: 'grey',
        providerReference: providerRef,
        clientReference: clientRef,
        status: ['completed', 'success'].includes(String(resData.status).toLowerCase()) ? 'COMPLETED' : 'PROCESSING',
        amount: Number(resData.source_amount || amount),
        currency: upCurrency,
        destinationAmount: Number(resData.destination_amount || 0),
        destinationCurrency: destCurrency,
        raw: resData
      };
    });
  }

  /**
   * Verify incoming Webhook Signature (HMAC-SHA256) per Grey Business API spec.
   *
   * Header: X-Webhook-Signature: sha256=<hex-digest>
   * Computed: HMAC-SHA256(webhookSecret, rawBody)
   */
  async verifyWebhookSignature(headers, payload) {
    try {
      // Grey Business API sends: X-Webhook-Signature: sha256=abc123...
      const sigHeader = headers['x-webhook-signature'] || headers['x-grey-signature'] || headers['signature'] || '';

      if (!sigHeader) {
        if (process.env.NODE_ENV === 'development' && !this.webhookSecret) {
          logger.warn('[GreySettlementProvider] Webhook signature missing in dev mode with no secret. Passing.');
          return true;
        }
        logger.warn('[GreySettlementProvider] Missing X-Webhook-Signature header.');
        return false;
      }

      // Strip optional "sha256=" prefix per Grey spec
      const signature = sigHeader.startsWith('sha256=')
        ? sigHeader.slice(7)
        : sigHeader;

      const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const computed = crypto
        .createHmac('sha256', this.webhookSecret || 'grey_test_secret')
        .update(rawBody)
        .digest('hex');

      let isValidSig = false;
      try {
        isValidSig = crypto.timingSafeEqual(
          Buffer.from(signature, 'hex'),
          Buffer.from(computed, 'hex')
        );
      } catch {
        // Length mismatch — definitely invalid
        isValidSig = false;
      }

      if (!isValidSig) {
        logger.warn('[GreySettlementProvider] Webhook signature mismatch — request rejected.');
        return false;
      }

      // Event Deduplication: correlate on transaction_reference (Grey) or client_reference
      const eventId =
        payload.transaction_reference ||
        payload.transaction_id ||
        payload.client_reference ||
        payload.id ||
        payload.event_id;

      if (eventId) {
        try {
          const { data: existing } = await supabase
            .from('webhook_events')
            .select('id')
            .eq('event_id', String(eventId))
            .maybeSingle();

          if (existing) {
            logger.info(`[GreySettlementProvider] Duplicate webhook event ${eventId} ignored (already processed).`);
            return false;
          }
        } catch (dbErr) {
          logger.warn(`[GreySettlementProvider] Deduplication check warning: ${dbErr.message}`);
        }
      }

      return true;
    } catch (e) {
      logger.error(`[GreySettlementProvider] Webhook verification error: ${e.message}`);
      return false;
    }
  }

  /**
   * Get Grey business wallet balances across currencies.
   * GET /v1/balances — returns one entry per currency wallet.
   * Response shape: { data: { balances: [ { currency, available_balance, pending_balance } ] } }
   */
  async getBalance(currency = null) {
    return this._executeWithRetry(async () => {
      const response = await this.client.get('/v1/balances');
      // Grey Business API: response.data.data.balances  or  response.data.balances
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

  /**
   * Fetch transaction(s) by reference.
   * GET /api/v1/transactions?client_reference=<ref>  or  ?reference=<greyRef>
   */
  async getTransaction(reference) {
    return this._executeWithRetry(async () => {
      // Grey Business API: list endpoint with query params (no single-transaction GET)
      const response = await this.client.get('/api/v1/transactions', {
        params: { client_reference: reference }
      });
      const list = response.data?.data || [];
      const d = Array.isArray(list) ? (list[0] || {}) : (list || {});

      let status = 'PENDING';
      if (['completed', 'success', 'successful'].includes(String(d.status).toLowerCase())) status = 'COMPLETED';
      if (['failed', 'rejected', 'cancelled'].includes(String(d.status).toLowerCase())) status = 'FAILED';

      return {
        reference: d.client_reference || d.reference || reference,
        providerReference: d.transaction_reference || d.reference || d.id || reference,
        amount: Number(d.source_amount || d.amount || 0),
        currency: String(d.source_currency || d.currency || '').toUpperCase(),
        status,
        raw: d
      };
    });
  }

  /**
   * Get exchange rate quote from Grey Business API.
   * POST /v1/currency/rate
   * Body: { source_amount, source_currency, destination_currency, transaction_type }
   * transaction_type: 'swap' | 'deposit' | 'withdraw'
   */
  async getExchangeRate(fromCurrency, toCurrency, amount = 1, transactionType = 'swap') {
    return this._executeWithRetry(async () => {
      const response = await this.client.post('/v1/currency/rate', {
        source_amount: Number(amount),
        source_currency: fromCurrency.toUpperCase(),
        destination_currency: toCurrency.toUpperCase(),
        transaction_type: transactionType
      });
      const d = response.data?.data || response.data || {};

      return {
        fromCurrency: (d.source_currency || fromCurrency).toUpperCase(),
        toCurrency: (d.destination_currency || toCurrency).toUpperCase(),
        rate: Number(d.source_destination_currency_rate || 1.0),
        inverseRate: Number(d.destination_source_currency_rate || 0),
        estimatedAmount: Number(d.destination_amount || amount),
        withdrawalFee: Number(d.withdrawal_fee || 0),
        depositFee: Number(d.deposit_fee || 0),
        swapFee: Number(d.swap_fee || 0)
      };
    });
  }

  /**
   * Create Beneficiary profile on Grey API
   */
  async createBeneficiary(data) {
    return this._executeWithRetry(async () => {
      const response = await this.client.post('/v1/beneficiaries', {
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        account_name: data.accountName,
        currency: data.currency ? data.currency.toUpperCase() : 'NGN',
        type: data.type || 'bank_account'
      });
      const d = response.data?.data || response.data || {};

      return {
        beneficiaryId: d.id || `ben_${Date.now()}`,
        accountName: d.account_name || data.accountName,
        accountNumber: d.account_number || data.accountNumber,
        bankCode: d.bank_code || data.bankCode
      };
    });
  }

  /**
   * Verify bank beneficiary account details
   */
  async verifyBeneficiary(accountNumber, bankCode) {
    return this._executeWithRetry(async () => {
      const response = await this.client.post('/v1/bank/verify-account', {
        account_number: accountNumber,
        bank_code: bankCode
      });
      const d = response.data?.data || response.data || {};

      return {
        accountName: d.account_name,
        accountNumber: d.account_number || accountNumber,
        bankCode: d.bank_code || bankCode,
        isValid: !!d.account_name
      };
    });
  }

  /**
   * Reverse transaction
   */
  async reverseTransaction(reference, reason) {
    return this._executeWithRetry(async () => {
      const response = await this.client.post(`/v1/payouts/${reference}/reverse`, { reason });
      const d = response.data?.data || response.data || {};

      return {
        success: true,
        reference: d.reference || reference,
        status: 'REVERSED',
        reason
      };
    });
  }

  /**
   * Health Check — Grey Business API has no /v1/health endpoint.
   * Use GET /v1/balances as a liveness probe (non-empty 2xx = healthy).
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
        message: ok ? 'Grey Business API operational' : `Unexpected status ${r.status}`
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return { status: 'UNHEALTHY', latencyMs, message: err.message };
    }
  }

  async getDepositSettlementStatus(providerReference) {
    const tx = await this.getTransaction(providerReference);
    return {
      isSettled: tx.status === 'COMPLETED',
      status: tx.status,
      settledAt: tx.raw?.completed_at || new Date().toISOString()
    };
  }
}

module.exports = GreySettlementProvider;
