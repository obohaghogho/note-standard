/**
 * FXQuoteEngine.js
 * ================
 * 5-minute signed FX quote lock — protects customers and platform
 * from exchange rate drift during checkout.
 *
 * Flow:
 *   1. Client requests a quote:  POST /api/payment/checkout-quote
 *   2. Engine returns a signed quote with a 5-minute TTL
 *   3. Client submits payment with quote_id
 *   4. Engine validates quote is still valid before processing
 *   5. If expired → client must request a new quote
 *
 * NoteStandard Financial Platform v4
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const FXProviderChain = require('./FXProviderChain');
const ConfigService = require('../ConfigService');
const { getDefaultCurrencyForCountry, isSupportedFiatCurrency } = require('../../config/paymentCurrencies');
const { QuoteExpiredError, UnsupportedCurrencyError, PaymentError } = require('../../utils/PaymentErrors');

const QUOTE_TTL_SECONDS = parseInt(ConfigService.get('FX_QUOTE_TTL_SECONDS') || '300', 10);
const QUOTE_SECRET = process.env.FX_QUOTE_SECRET || 'ns_fx_quote_signing_secret_v1';

class FXQuoteEngine {
  _generateSignature(quoteId, from, to, amount, rate, expiresAt) {
    const payload = `${quoteId}:${from}:${to}:${amount}:${rate}:${expiresAt}`;
    return crypto.createHmac('sha256', QUOTE_SECRET).update(payload).digest('hex');
  }

  /**
   * Generates a signed FX quote v1.0.
   * If fromCurrency === toCurrency, no conversion is applied.
   *
   * @param {Object} params
   * @param {number} params.amount             - User's requested amount
   * @param {string} params.fromCurrency       - User's currency (e.g. AUD, CAD, NZD, JPY)
   * @param {string} params.toCurrency         - Gateway processing currency (e.g. USD)
   * @param {string} [params.userId]
   * @param {string} [params.countryCode]      - ISO 3166 country code for checkout default
   * @returns {Promise<Object>} quote record
   */
  async generateQuote({ amount, fromCurrency, toCurrency, userId, countryCode }) {
    // Resolve currency defaults from country if not provided
    const resolvedFrom = fromCurrency
      ? String(fromCurrency).toUpperCase()
      : getDefaultCurrencyForCountry(countryCode);

    const resolvedTo = toCurrency ? String(toCurrency).toUpperCase() : resolvedFrom;

    if (!isSupportedFiatCurrency(resolvedFrom)) {
      throw new UnsupportedCurrencyError(resolvedFrom, `[FXQuoteEngine] Unsupported requested currency: ${resolvedFrom}`);
    }

    const quoteId = `fxq_${uuidv4().replace(/-/g, '')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000).toISOString();
    const isConversion = resolvedFrom !== resolvedTo;

    let convertedAmount = amount;
    let exchangeRate = 1;
    let fxProvider = 'identity';

    if (isConversion) {
      const result = await FXProviderChain.convert(amount, resolvedFrom, resolvedTo);
      convertedAmount = result.convertedAmount;
      exchangeRate = result.rate;
      fxProvider = result.provider;
    }

    const signature = this._generateSignature(quoteId, resolvedFrom, resolvedTo, amount, exchangeRate, expiresAt);

    const quote = {
      quote_id:           quoteId,
      quote_version:      'v1.0',
      user_id:            userId || null,
      from_currency:      resolvedFrom,
      to_currency:        resolvedTo,
      original_amount:    amount,
      converted_amount:   convertedAmount,
      exchange_rate:      exchangeRate,
      fx_provider:        fxProvider,
      is_conversion:      isConversion,
      issued_at:          now.toISOString(),
      expires_at:         expiresAt,
      signature:          signature,
      used:               false,
      created_at:         now.toISOString(),
    };

    const { data, error } = await supabase
      .from('fx_quotes')
      .insert(quote)
      .select()
      .single();

    if (error) {
      logger.error(`[FXQuoteEngine] Failed to persist quote: ${error.message}`);
      throw new Error(`FXQuoteEngine: Could not persist quote — ${error.message}`);
    }

    logger.info(`[FXQuoteEngine] Quote generated: ${quoteId} (v1.0) | ${resolvedFrom}→${resolvedTo} | rate=${exchangeRate} | expires=${expiresAt}`);
    return data;
  }

  /**
   * Validates a quote by ID and marks it as used (single-use).
   * Throws structured QuoteExpiredError (HTTP 409) if expired or consumed.
   *
   * @param {string} quoteId
   * @returns {Promise<Object>} validated quote record
   */
  async validateAndConsume(quoteId) {
    const { data: quote, error } = await supabase
      .from('fx_quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .maybeSingle();

    if (error || !quote) {
      throw new PaymentError(`Quote not found: ${quoteId}`, "QUOTE_NOT_FOUND", 444);
    }

    if (quote.used) {
      throw new PaymentError(`Quote already consumed: ${quoteId}`, "QUOTE_ALREADY_USED", 409);
    }

    if (new Date(quote.expires_at) < new Date()) {
      throw new QuoteExpiredError(`FX quote ${quoteId} has expired. Please request a fresh quote.`, { quoteId, expiresAt: quote.expires_at });
    }

    // Mark consumed
    await supabase
      .from('fx_quotes')
      .update({ used: true, consumed_at: new Date().toISOString() })
      .eq('quote_id', quoteId);

    logger.info(`[FXQuoteEngine] Quote consumed: ${quoteId}`);
    return quote;
  }

  /**
   * Peeks at a quote without consuming it.
   * @param {string} quoteId
   * @returns {Promise<Object | null>}
   */
  async peek(quoteId) {
    const { data } = await supabase
      .from('fx_quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .maybeSingle();
    return data;
  }
}

module.exports = new FXQuoteEngine();
