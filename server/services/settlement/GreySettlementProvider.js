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
    this.businessId = (process.env.GREY_BUSINESS_ID || '').trim();
    this.webhookSecret = (process.env.GREY_WEBHOOK_SECRET || '').trim();
    this.baseUrl = (process.env.GREY_BASE_URL || 'https://api.grey.co').trim();
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
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Business-ID': this.businessId,
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
   * Create an external or P2P Payout
   */
  async createPayout({ address, amount, currency, network, reference, beneficiaryId, metadata = {} }) {
    return this._executeWithRetry(async () => {
      const upCurrency = String(currency).toUpperCase();
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

      logger.info(`[GreySettlementProvider] Initiating Payout (${upCurrency} ${amount})`, {
        reference,
        beneficiaryId,
        idempotencyKey
      });

      // Prepare request payload
      const payload = {
        amount: Number(amount),
        currency: upCurrency,
        reference: String(reference),
        narration: metadata.narration || `NoteStandard Payout ${reference}`,
        beneficiary_id: beneficiaryId || address,
        idempotency_key: idempotencyKey,
        metadata: {
          ...metadata,
          source: 'note_standard_v4',
          reference
        }
      };

      let endpoint = '/v1/payouts';
      if (metadata.isP2p) {
        endpoint = '/v1/payouts/p2p';
      }

      const response = await this.client.post(endpoint, payload, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      const resData = response.data?.data || response.data || {};
      const providerRef = resData.id || resData.reference || reference;

      // Track settlement volume against daily limit
      await GreyDailyLimitService.recordSettlement(amount, upCurrency, reference);

      return {
        success: true,
        providerId: 'grey',
        providerReference: providerRef,
        status: resData.status === 'completed' ? 'COMPLETED' : 'PROCESSING',
        amount: Number(amount),
        currency: upCurrency,
        raw: resData
      };
    });
  }

  /**
   * Verify incoming Webhook Signature (HMAC-SHA256)
   */
  async verifyWebhookSignature(headers, payload) {
    try {
      const signature = headers['x-grey-signature'] || headers['signature'] || headers['x-webhook-signature'];
      if (!signature) {
        if (process.env.NODE_ENV === 'development' && !this.webhookSecret) {
          logger.warn('[GreySettlementProvider] Webhook signature missing in dev mode with no secret. Passing.');
          return true;
        }
        return false;
      }

      const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const computed = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
    } catch (e) {
      logger.error(`[GreySettlementProvider] Webhook verification failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Get Grey custody balances across currencies
   */
  async getBalance(currency = null) {
    return this._executeWithRetry(async () => {
      const response = await this.client.get('/v1/balances');
      const balances = response.data?.data || response.data || [];

      if (currency) {
        const up = currency.toUpperCase();
        const found = balances.find(b => String(b.currency).toUpperCase() === up);
        return {
          currency: up,
          balance: found ? Number(found.amount || found.balance || 0) : 0.0,
          availableBalance: found ? Number(found.available_amount || found.available || 0) : 0.0
        };
      }

      return balances.map(b => ({
        currency: String(b.currency).toUpperCase(),
        balance: Number(b.amount || b.balance || 0),
        availableBalance: Number(b.available_amount || b.available || 0)
      }));
    });
  }

  /**
   * Fetch single transaction by reference
   */
  async getTransaction(reference) {
    return this._executeWithRetry(async () => {
      const response = await this.client.get(`/v1/transactions/${encodeURIComponent(reference)}`);
      const d = response.data?.data || response.data || {};
      
      let status = 'PENDING';
      if (['completed', 'success', 'successful'].includes(d.status)) status = 'COMPLETED';
      if (['failed', 'rejected', 'cancelled'].includes(d.status)) status = 'FAILED';

      return {
        reference: d.reference || reference,
        providerReference: d.id || d.reference || reference,
        amount: Number(d.amount || 0),
        currency: String(d.currency || '').toUpperCase(),
        status,
        raw: d
      };
    });
  }

  /**
   * Fetch real-time FX exchange rate quote from Grey API
   */
  async getExchangeRate(fromCurrency, toCurrency, amount = 1) {
    return this._executeWithRetry(async () => {
      const response = await this.client.get('/v1/fx/quote', {
        params: { from: fromCurrency.toUpperCase(), to: toCurrency.toUpperCase(), amount }
      });
      const d = response.data?.data || response.data || {};

      return {
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate: Number(d.rate || 1.0),
        estimatedAmount: Number(d.target_amount || amount * (d.rate || 1.0)),
        expiresAt: d.expires_at || new Date(Date.now() + 60000).toISOString()
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
   * Health Check ping
   */
  async healthCheck() {
    const start = Date.now();
    try {
      if (this.circuitOpen) {
        return { status: 'DEGRADED', latencyMs: 0, message: 'Circuit breaker is OPEN' };
      }
      await this.client.get('/v1/health');
      const latencyMs = Date.now() - start;
      return { status: 'HEALTHY', latencyMs, message: 'Grey API operational' };
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
