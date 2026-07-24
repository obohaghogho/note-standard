/**
 * FXProviderChain.js
 * ==================
 * Pluggable multi-tier FX rate resolution.
 * Priority: Primary → Fallback → Cache → Last Known Good Seed
 *
 * NoteStandard Financial Platform v4
 */

const axios = require('axios');
const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const ConfigService = require('../ConfigService');

// In-memory rate cache
const _cache = new Map();
const CACHE_TTL_MS = (parseInt(ConfigService.get('FX_CACHE_TTL_SECONDS') || '600', 10)) * 1000;

// Hardcoded last-resort LKG seed rates (USD base, updated periodically in code)
const LKG_SEED_RATES = {
  USD: 1,
  NGN: 1590,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 155.5,
  ZAR: 18.5,
  GHS: 12.1,
  KES: 130,
};

class FXProviderChain {
  /**
   * Returns the exchange rate from `fromCurrency` to `toCurrency`.
   * Walks the provider chain until a valid rate is found.
   *
   * @param {string} fromCurrency
   * @param {string} toCurrency
   * @returns {Promise<{ rate: number, provider: string }>}
   */
  async getRate(fromCurrency, toCurrency) {
    const from = String(fromCurrency).toUpperCase();
    const to = String(toCurrency).toUpperCase();

    if (from === to) return { rate: 1, provider: 'identity' };

    const cacheKey = `${from}_${to}`;

    // 1. In-Memory Cache
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      logger.debug(`[FXProviderChain] Cache hit: ${cacheKey} = ${cached.rate}`);
      return { rate: cached.rate, provider: 'cache' };
    }

    // 2. Primary: ExchangeRate-API
    try {
      const apiKey = ConfigService.get('EXCHANGE_RATE_API_KEY');
      if (apiKey) {
        const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`;
        const { data } = await axios.get(url, { timeout: 5000 });
        if (data?.conversion_rate) {
          const rate = data.conversion_rate;
          this._cacheRate(cacheKey, rate);
          await this._persistLKG(from, to, rate, 'exchangerate-api');
          logger.info(`[FXProviderChain] Primary rate: ${from}→${to} = ${rate}`);
          return { rate, provider: 'exchangerate-api' };
        }
      }
    } catch (err) {
      logger.warn(`[FXProviderChain] Primary failed: ${err.message}`);
    }

    // 3. Fallback: Open Exchange Rates (free endpoint)
    try {
      const url = `https://open.er-api.com/v6/latest/${from}`;
      const { data } = await axios.get(url, { timeout: 5000 });
      if (data?.rates?.[to]) {
        const rate = data.rates[to];
        this._cacheRate(cacheKey, rate);
        await this._persistLKG(from, to, rate, 'open-exchange-rates');
        logger.info(`[FXProviderChain] Fallback rate: ${from}→${to} = ${rate}`);
        return { rate, provider: 'open-exchange-rates' };
      }
    } catch (err) {
      logger.warn(`[FXProviderChain] Fallback failed: ${err.message}`);
    }

    // 4. Database Persistent LKG
    try {
      const { data: lkg } = await supabase
        .from('fx_rates_lkg')
        .select('rate')
        .eq('from_currency', from)
        .eq('to_currency', to)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lkg?.rate) {
        logger.warn(`[FXProviderChain] LKG DB rate: ${from}→${to} = ${lkg.rate}`);
        return { rate: Number(lkg.rate), provider: 'lkg-database' };
      }
    } catch (err) {
      logger.warn(`[FXProviderChain] LKG DB lookup failed: ${err.message}`);
    }

    // 5. Hardcoded Seed (Last Resort)
    const rate = this._seedRate(from, to);
    logger.error(`[FXProviderChain] Using hardcoded seed rate: ${from}→${to} = ${rate}`);
    return { rate, provider: 'lkg-seed' };
  }

  /**
   * Converts an amount from one currency to another.
   * @param {number} amount
   * @param {string} fromCurrency
   * @param {string} toCurrency
   * @returns {Promise<{ convertedAmount: number, rate: number, provider: string }>}
   */
  async convert(amount, fromCurrency, toCurrency) {
    const { rate, provider } = await this.getRate(fromCurrency, toCurrency);
    const convertedAmount = parseFloat((amount * rate).toFixed(8));
    return { convertedAmount, rate, provider };
  }

  _cacheRate(key, rate) {
    _cache.set(key, { rate, ts: Date.now() });
  }

  async _persistLKG(from, to, rate, source) {
    try {
      await supabase.from('fx_rates_lkg').upsert(
        { from_currency: from, to_currency: to, rate, source, updated_at: new Date().toISOString() },
        { onConflict: 'from_currency,to_currency' }
      );
    } catch (_) { /* non-blocking */ }
  }

  _seedRate(from, to) {
    // Cross-rate via USD
    const fromUSD = LKG_SEED_RATES[from] || 1;
    const toUSD   = LKG_SEED_RATES[to]   || 1;
    return parseFloat((toUSD / fromUSD).toFixed(8));
  }

  /**
   * Invalidates the in-memory cache for a specific pair.
   */
  invalidateCache(fromCurrency, toCurrency) {
    _cache.delete(`${fromCurrency}_${toCurrency}`);
  }
}

module.exports = new FXProviderChain();
