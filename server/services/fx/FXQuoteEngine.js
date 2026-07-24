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
const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const FXProviderChain = require('./FXProviderChain');
const ConfigService = require('../ConfigService');
const { getDefaultCurrencyForCountry, isSupportedFiatCurrency } = require('../../config/paymentCurrencies');

const QUOTE_TTL_SECONDS = parseInt(ConfigService.get('FX_QUOTE_TTL_SECONDS') || '300', 10);

class FXQuoteEngine {
  /**
   * Generates a signed FX quote.
   * If fromCurrency === toCurrency, no conversion is applied.
   *
   * @param {Object} params
   * @param {number} params.amount             - User's requested amount
   * @param {string} params.fromCurrency       - User's currency (e.g. JPY)
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
      throw new Error(`[FXQuoteEngine] Unsupported requested currency: ${resolvedFrom}`);
    }

    const quoteId = `fxq_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString();
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

    const quote = {
      quote_id:           quoteId,
      user_id:            userId || null,
      from_currency:      resolvedFrom,
      to_currency:        resolvedTo,
      original_amount:    amount,
      converted_amount:   convertedAmount,
      exchange_rate:      exchangeRate,
      fx_provider:        fxProvider,
      is_conversion:      isConversion,
      expires_at:         expiresAt,
      used:               false,
      created_at:         new Date().toISOString(),
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

    logger.info(`[FXQuoteEngine] Quote generated: ${quoteId} | ${resolvedFrom}→${resolvedTo} | rate=${exchangeRate} | expires=${expiresAt}`);
    return data;
  }

  /**
   * Validates a quote by ID and marks it as used (single-use).
   * Throws if quote is expired, not found, or already used.
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
      throw new Error(`[FXQuoteEngine] Quote not found: ${quoteId}`);
    }

    if (quote.used) {
      throw new Error(`[FXQuoteEngine] Quote already consumed: ${quoteId}`);
    }

    if (new Date(quote.expires_at) < new Date()) {
      throw new Error(`[FXQuoteEngine] Quote expired: ${quoteId}. Please request a new rate.`);
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
