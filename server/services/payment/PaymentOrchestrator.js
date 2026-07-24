/**
 * PaymentOrchestrator.js
 * ======================
 * Single top-level entry point for ALL money movement on NoteStandard.
 * Coordinates: Compliance → Risk → FX Quote → Gateway Router → Adapter → Ledger → Event
 *
 * Pipeline for every payment:
 *   1. Idempotency Guard     — prevent duplicate processing
 *   2. Compliance Check      — KYC/AML/country hooks
 *   3. Fraud Risk Evaluation — velocity, size, country, card failure checks
 *   4. FX Quote Resolution   — validate quote OR resolve exchange rate
 *   5. Gateway Selection     — dynamic scoring router
 *   6. Native vs. Converted  — native: send as-is | converted: apply rate
 *   7. Gateway Initialization — adapter call
 *   8. Ledger Entry          — immutable double-entry record
 *   9. Event Emission        — payment.initialized event
 *
 * NoteStandard Financial Platform v4
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('../../config/database');
const logger = require('../../utils/logger');

const IdempotencyGuard   = require('./IdempotencyGuard');
const FraudRiskEngine    = require('../risk/FraudRiskEngine');
const ComplianceManager  = require('../compliance/ComplianceManager');
const GatewayRouter      = require('./GatewayRouter');
const FXProviderChain    = require('../fx/FXProviderChain');
const FXQuoteEngine      = require('../fx/FXQuoteEngine');
const LedgerService      = require('../ledger/LedgerService');
const AuditLogger        = require('../audit/AuditLogger');
const PaymentEventBus    = require('./PaymentEventBus');
const ConfigService      = require('../ConfigService');
const { getDefaultCurrencyForCountry } = require('../../config/paymentCurrencies');

class PaymentOrchestrator {
  /**
   * Creates a payment intent — the main entry point for card/checkout payments.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.email
   * @param {number} params.amount             - User-requested amount in requestedCurrency
   * @param {string} params.requestedCurrency  - User's chosen currency (e.g. 'JPY')
   * @param {string} [params.quoteId]          - Optional pre-generated FX quote ID
   * @param {string} [params.method]           - 'card' | 'bank_transfer' | 'dva' | 'crypto'
   * @param {string} [params.countryCode]      - ISO 3166-1 for country-aware defaults
   * @param {string} [params.idempotencyKey]
   * @param {string} [params.callbackUrl]
   * @param {Object} [params.metadata]
   * @returns {Promise<{ reference: string, checkoutUrl: string, amount: number, currency: string, quote: Object }>}
   */
  async createPaymentIntent(params) {
    const {
      userId,
      email,
      amount,
      method = 'card',
      countryCode,
      callbackUrl,
      metadata = {},
    } = params;

    // Resolve currency — from explicit param, quote, or country default
    const requestedCurrency = params.requestedCurrency
      ? String(params.requestedCurrency).toUpperCase()
      : getDefaultCurrencyForCountry(countryCode);

    const idempotencyKey = params.idempotencyKey || `pi_${uuidv4()}`;

    // ─── 1. Idempotency Guard ─────────────────────────────────────────────
    const { result: existingResult, wasDuplicate } = await IdempotencyGuard.guard(
      idempotencyKey,
      'payment',
      async () => null, // guard check only — we'll commit after success
    );
    if (wasDuplicate && existingResult) {
      logger.info(`[PaymentOrchestrator] Duplicate payment intent: ${idempotencyKey}`);
      return existingResult;
    }

    // ─── 2. Compliance Check ──────────────────────────────────────────────
    await ComplianceManager.evaluate({ userId, email, amount, currency: requestedCurrency, countryCode, purpose: 'deposit' });

    // ─── 3. Fraud Risk Evaluation ─────────────────────────────────────────
    const risk = await FraudRiskEngine.evaluate({ userId, email, amount, currency: requestedCurrency, countryCode, method });
    if (!risk.approved) {
      throw new Error(`[PaymentOrchestrator] Payment rejected by risk engine: ${risk.reason}`);
    }

    // ─── 4. FX Quote Resolution ───────────────────────────────────────────
    let quote = null;
    let gatewayCurrency = requestedCurrency;
    let gatewayAmount   = amount;
    let exchangeRate    = 1;
    let fxProvider      = 'identity';

    if (params.quoteId) {
      // Validate pre-generated quote
      quote = await FXQuoteEngine.validateAndConsume(params.quoteId);
      gatewayCurrency = quote.to_currency;
      gatewayAmount   = quote.converted_amount;
      exchangeRate    = quote.exchange_rate;
      fxProvider      = quote.fx_provider;
    } else {
      // ─── 5. Gateway Selection (before FX — to know if conversion needed) ──
      const { providerName, isNative } = GatewayRouter.selectBestGateway({ currency: requestedCurrency, method });

      if (!isNative) {
        // Native processing not available — find what the gateway supports
        const bestNative = this._findBestNativeCurrency(providerName, method);
        const conversion = await FXProviderChain.convert(amount, requestedCurrency, bestNative);
        gatewayCurrency = bestNative;
        gatewayAmount   = conversion.convertedAmount;
        exchangeRate    = conversion.rate;
        fxProvider      = conversion.provider;
        logger.info(`[PaymentOrchestrator] Converting ${requestedCurrency}→${gatewayCurrency}: ${amount}→${gatewayAmount} @ ${exchangeRate} (${fxProvider})`);
      }
    }

    // ─── 5. Gateway Selection (final, with resolved gatewayCurrency) ──────
    const { adapter, providerName } = GatewayRouter.selectBestGateway({ currency: gatewayCurrency, method });

    // ─── 6. Resolve Wallet ────────────────────────────────────────────────
    const { data: wallet } = await supabase
      .from('wallets_store')
      .select('id')
      .eq('user_id', userId)
      .eq('currency', requestedCurrency)
      .maybeSingle();

    if (!wallet) {
      throw new Error(`[PaymentOrchestrator] No ${requestedCurrency} wallet found for user ${userId}`);
    }

    // ─── 7. Build Reference & Transaction Record ──────────────────────────
    const reference = `pi_${uuidv4().replace(/-/g, '')}`;
    const ledgerCurrency = ConfigService.get('BUSINESS_LEDGER_CURRENCY') || 'USD';
    const settlementCurrency = this._getSettlementCurrency(providerName, gatewayCurrency);

    const txPayload = {
      user_id:              userId,
      wallet_id:            wallet.id,
      amount:               gatewayAmount,
      currency:             gatewayCurrency,
      // 4-Currency Hierarchy
      requested_currency:   requestedCurrency,
      requested_amount:     amount,
      gateway_currency:     gatewayCurrency,
      gateway_amount:       gatewayAmount,
      settlement_currency:  settlementCurrency,
      ledger_currency:      ledgerCurrency,
      exchange_rate:        exchangeRate,
      fx_provider:          fxProvider,
      // Status
      status:               'INITIALIZED',
      reference_id:         reference,
      idempotency_key:      idempotencyKey,
      provider:             providerName,
      type:                 'DEPOSIT',
      display_label:        `Deposit ${requestedCurrency}`,
      metadata: {
        ...metadata,
        requestedCurrency,
        requestedAmount:    amount,
        gatewayCurrency,
        gatewayAmount,
        settlementCurrency,
        exchangeRate,
        fxProvider,
        quoteId:            quote?.quote_id || null,
        riskScore:          risk.riskScore,
        intent_created_at:  new Date().toISOString(),
      },
    };

    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert(txPayload)
      .select()
      .single();

    if (txError) {
      throw new Error(`[PaymentOrchestrator] Failed to create transaction: ${txError.message}`);
    }

    // ─── 8. Initialize Payment via Adapter ───────────────────────────────
    const initResult = await adapter.initializePayment({
      email,
      amount:      gatewayAmount,
      currency:    gatewayCurrency,
      reference,
      callbackUrl,
      metadata:    txPayload.metadata,
    });

    // Update transaction with provider reference
    await supabase
      .from('transactions')
      .update({ status: 'PENDING', provider_ref: initResult.providerReference })
      .eq('reference_id', reference);

    // ─── 9. Ledger Entry ──────────────────────────────────────────────────
    try {
      await LedgerService.postSingleEntry({
        walletId:          wallet.id,
        direction:         'CREDIT',
        amount:            gatewayAmount,
        currency:          gatewayCurrency,
        type:              'DEPOSIT_PENDING',
        reference,
        description:       `Payment intent: ${requestedCurrency} ${amount}`,
        userId,
        provider:          providerName,
        requestedCurrency,
        requestedAmount:   amount,
        exchangeRate,
        metadata:          txPayload.metadata,
      });
    } catch (ledgerErr) {
      logger.error(`[PaymentOrchestrator] Ledger entry failed (non-blocking): ${ledgerErr.message}`);
    }

    // ─── 10. Audit Log & Events ──────────────────────────────────────────
    await AuditLogger.success({
      action:            'payment.initialized',
      userId,
      service:           'PaymentOrchestrator',
      provider:          providerName,
      reference,
      requestedCurrency,
      requestedAmount:   amount,
      gatewayCurrency,
      gatewayAmount,
      exchangeRate,
    });

    PaymentEventBus.emit('payment.initialized', {
      reference,
      userId,
      provider:          providerName,
      requestedCurrency,
      requestedAmount:   amount,
      gatewayCurrency,
      gatewayAmount,
      exchangeRate,
      checkoutUrl:       initResult.checkoutUrl,
    });

    // Commit idempotency result
    const response = {
      reference,
      checkoutUrl:        initResult.checkoutUrl,
      providerReference:  initResult.providerReference,
      originalAmount:     amount,
      originalCurrency:   requestedCurrency,
      gatewayAmount,
      gatewayCurrency,
      settlementCurrency,
      exchangeRate,
      fxProvider,
      isConverted:        requestedCurrency !== gatewayCurrency,
    };

    await IdempotencyGuard.commit(idempotencyKey, 'payment', response);
    return response;
  }

  /**
   * Issues a refund against an original transaction.
   * Policy: Refund in the gateway processing currency using the original rate snapshot.
   */
  async refundPayment({ reference, reason, requestedBy }) {
    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('reference_id', reference)
      .maybeSingle();

    if (!tx) throw new Error(`[PaymentOrchestrator] Transaction not found: ${reference}`);
    if (tx.status !== 'SUCCESS') throw new Error(`[PaymentOrchestrator] Cannot refund non-successful transaction: ${tx.status}`);

    const { adapter } = GatewayRouter.selectBestGateway({ currency: tx.gateway_currency || tx.currency, method: 'card' });
    const result = await adapter.refundPayment(tx.provider_ref || reference, tx.gateway_amount || tx.amount, reason);

    await AuditLogger.success({
      action:            'payment.refund_issued',
      userId:            tx.user_id,
      service:           'PaymentOrchestrator',
      provider:          tx.provider,
      reference,
      requestedCurrency: tx.requested_currency,
      requestedAmount:   tx.requested_amount,
      gatewayCurrency:   tx.gateway_currency,
      gatewayAmount:     tx.gateway_amount,
      exchangeRate:      tx.exchange_rate,
      metadata:          { reason, requestedBy },
    });

    PaymentEventBus.emit('payment.refund_issued', { reference, provider: tx.provider, result });
    return result;
  }

  /**
   * Returns the best native currency fallback for a given provider.
   */
  _findBestNativeCurrency(providerName, method) {
    const { getProviderCapabilities } = require('../../config/providerCapabilities');
    const caps = getProviderCapabilities(providerName);
    // Prefer USD as universal fallback, then first merchant currency
    if (caps.merchantCurrencies.includes('USD')) return 'USD';
    return caps.merchantCurrencies[0];
  }

  /**
   * Returns the settlement currency for a provider + gateway currency combo.
   */
  _getSettlementCurrency(providerName, gatewayCurrency) {
    try {
      const { getProviderCapabilities } = require('../../config/providerCapabilities');
      const caps = getProviderCapabilities(providerName);
      return caps.settlementCurrencies.includes(gatewayCurrency)
        ? gatewayCurrency
        : caps.settlementCurrencies[0];
    } catch {
      return gatewayCurrency;
    }
  }
}

module.exports = new PaymentOrchestrator();
