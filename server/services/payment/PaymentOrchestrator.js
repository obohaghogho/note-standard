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

const SettlementPolicyEngine = require('./SettlementPolicyEngine');

class PaymentOrchestrator {
  /**
   * Creates a payment intent — the main entry point for card/checkout payments.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.email
   * @param {number} params.amount             - User-requested amount in requestedCurrency
   * @param {string} params.requestedCurrency  - User's chosen currency (e.g. 'AUD', 'CAD', 'NZD', 'JPY')
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
      // Validate pre-generated quote (versioned v1.0, throws QuoteExpiredError on timeout)
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

    // ─── 6. Resolve Wallet & Decoupled Settlement ─────────────────────────
    const upRequestedCurrency = String(requestedCurrency || 'USD').toUpperCase();
    let { data: wallet } = await supabase
      .from('wallets_store')
      .select('id')
      .eq('user_id', userId)
      .eq('currency', upRequestedCurrency)
      .maybeSingle();

    if (!wallet) {
      const FiatWalletService = require('../FiatWalletService');
      wallet = await FiatWalletService.createWallet(userId, upRequestedCurrency);
    }

    // ─── 7. Build Reference & Transaction Record ──────────────────────────
    const reference = `pi_${uuidv4().replace(/-/g, '')}`;
    const ledgerCurrency = ConfigService.get('BUSINESS_LEDGER_CURRENCY') || 'USD';
    const settlementCurrency = SettlementPolicyEngine.resolveSettlementCurrency(gatewayCurrency);

    const snapshotData = {
      requestedCurrency,
      requestedAmount: amount,
      gatewayCurrency,
      gatewayAmount,
      settlementCurrency,
      exchangeRate,
      fxProvider,
      quoteId: quote?.quote_id || null,
      quoteVersion: quote?.quote_version || 'v1.0',
      riskScore: risk.riskScore,
      intent_created_at: new Date().toISOString(),
    };

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
      // Status Machine
      status:               'INITIALIZED',
      reference_id:         reference,
      idempotency_key:      idempotencyKey,
      provider:             providerName,
      type:                 'DEPOSIT',
      display_label:        `Deposit ${requestedCurrency}`,
      metadata:             snapshotData,
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

    // Update transaction with provider reference and state
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
   * Symmetrical Withdrawal Orchestrator — Handles AUD, CAD, NZD, USD, EUR, GBP, NGN, JPY payouts.
   */
  async processWithdrawalIntent({ userId, amount, currency, bankDetails, idempotencyKey }) {
    const upCurrency = String(currency).toUpperCase();
    logger.info(`[PaymentOrchestrator] Processing withdrawal: ${upCurrency} ${amount} for user ${userId}`);

    // Verify wallet balance
    const { data: wallet } = await supabase
      .from('wallets_store')
      .select('id, available, balance')
      .eq('user_id', userId)
      .eq('currency', upCurrency)
      .maybeSingle();

    if (!wallet) throw new Error(`[PaymentOrchestrator] ${upCurrency} wallet not found.`);
    if (parseFloat(wallet.available) < amount) {
      throw new Error(`[PaymentOrchestrator] Insufficient available balance in ${upCurrency} wallet.`);
    }

    const { providerName, isNative } = GatewayRouter.selectBestGateway({ currency: upCurrency, method: 'bank_transfer' });
    let gatewayCurrency = upCurrency;
    let gatewayAmount = amount;
    let exchangeRate = 1;

    if (!isNative) {
      const bestNative = this._findBestNativeCurrency(providerName, 'bank_transfer');
      const conversion = await FXProviderChain.convert(amount, upCurrency, bestNative);
      gatewayCurrency = bestNative;
      gatewayAmount = conversion.convertedAmount;
      exchangeRate = conversion.rate;
    }

    const reference = `wd_${uuidv4().replace(/-/g, '')}`;

    const txPayload = {
      user_id: userId,
      wallet_id: wallet.id,
      amount: gatewayAmount,
      currency: gatewayCurrency,
      requested_currency: upCurrency,
      requested_amount: amount,
      gateway_currency: gatewayCurrency,
      gateway_amount: gatewayAmount,
      settlement_currency: gatewayCurrency,
      exchange_rate: exchangeRate,
      status: 'PENDING',
      reference_id: reference,
      provider: providerName,
      type: 'WITHDRAWAL',
      display_label: `Withdrawal ${upCurrency}`,
      metadata: { bankDetails, requestedCurrency: upCurrency, gatewayCurrency, exchangeRate },
    };

    await supabase.from('transactions').insert(txPayload);
    logger.info(`[PaymentOrchestrator] Withdrawal initialized: ${reference}`);
    return { reference, status: 'PENDING', requestedAmount: amount, requestedCurrency: upCurrency, gatewayCurrency, gatewayAmount, exchangeRate };
  }

  /**
   * Internal Wallet-to-Wallet Conversion (AUD ↔ USD, CAD ↔ GBP, NZD ↔ EUR, NGN ↔ CAD, etc.)
   */
  async convertWalletFunds({ userId, fromCurrency, toCurrency, amount, quoteId }) {
    const from = String(fromCurrency).toUpperCase();
    const to = String(toCurrency).toUpperCase();

    logger.info(`[PaymentOrchestrator] Internal wallet swap: ${from} ${amount} → ${to} for user ${userId}`);

    let quote = null;
    let exchangeRate = 1;
    let targetAmount = amount;

    if (quoteId) {
      quote = await FXQuoteEngine.validateAndConsume(quoteId);
      exchangeRate = quote.exchange_rate;
      targetAmount = quote.converted_amount;
    } else {
      const conversion = await FXProviderChain.convert(amount, from, to);
      exchangeRate = conversion.rate;
      targetAmount = conversion.convertedAmount;
    }

    const { data: sourceWallet } = await supabase.from('wallets_store').select('id, available').eq('user_id', userId).eq('currency', from).single();
    if (!sourceWallet || parseFloat(sourceWallet.available) < amount) {
      throw new Error(`Insufficient funds in ${from} wallet.`);
    }

    let { data: targetWallet } = await supabase.from('wallets_store').select('id').eq('user_id', userId).ilike('currency', to).maybeSingle();
    if (!targetWallet) {
      const { data: newW } = await supabase.from('wallets_store').upsert({ user_id: userId, currency: to, balance: 0, available: 0 }, { onConflict: 'user_id,currency' }).select().maybeSingle();
      targetWallet = newW || (await supabase.from('wallets_store').select('id').eq('user_id', userId).ilike('currency', to).maybeSingle());
    }

    const reference = `swap_${uuidv4().replace(/-/g, '')}`;

    await supabase.from('transactions').insert({
      user_id: userId,
      wallet_id: sourceWallet.id,
      amount,
      currency: from,
      requested_currency: from,
      requested_amount: amount,
      gateway_currency: to,
      gateway_amount: targetAmount,
      exchange_rate: exchangeRate,
      status: 'SUCCESS',
      reference_id: reference,
      type: 'SWAP',
      display_label: `Swap ${from} to ${to}`,
      metadata: { from, to, amount, targetAmount, exchangeRate, quoteId: quote?.quote_id || null },
    });

    logger.info(`[PaymentOrchestrator] Wallet swap completed: ${reference} | ${from} ${amount} → ${to} ${targetAmount}`);
    return { success: true, reference, fromCurrency: from, toCurrency: to, fromAmount: amount, toAmount: targetAmount, exchangeRate };
  }

  /**
   * Issues a refund against an original transaction preserving rate snapshots.
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
    if (caps.merchantCurrencies.includes('USD')) return 'USD';
    return caps.merchantCurrencies[0];
  }
}

module.exports = new PaymentOrchestrator();
