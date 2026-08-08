/**
 * FincraRateProvider — Fiat Exchange Rate Provider
 * ─────────────────────────────────────────────────
 * Queries Fincra's conversion rates API for fiat currency pairs.
 * Uses the gateway client for IPv4-enforced requests.
 * 
 * Fincra is the EXECUTION AUTHORITY for NGN-related fiat pairs.
 * This ensures quote-to-settlement consistency.
 */

const logger = require('../utils/logger');
const cache = require('../utils/cache');

const CACHE_TTL = 300; // 5 minutes

class FincraRateProvider {
  constructor() {
    this._client = null;
    this._businessId = null;
    this._supportedPairs = null; // Discovered dynamically, not hardcoded
  }

  /**
   * Lazy-load the Fincra client to avoid circular dependency issues at startup
   */
  _getClient() {
    if (!this._client) {
      try {
        const { getFincraClient } = require('../services/fincra/client');
        const { instance, businessId } = getFincraClient();
        this._client = instance;
        this._businessId = businessId || '';
      } catch (err) {
        logger.warn(`[FincraRateProvider] Failed to create Fincra client: ${err.message}`);
        return null;
      }
    }
    return this._client;
  }

  /**
   * Check if the provider is available and responding
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const client = this._getClient();
      if (!client) return false;
      const rates = await this._fetchRates();
      return rates !== null && Object.keys(rates).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Fetch raw rates from Fincra's conversion rates API
   * @returns {Promise<Object|null>} - Raw rates response or null
   */
  async _fetchRates() {
    const cacheKey = 'fincra_rates_raw';
    
    return cache.wrap(cacheKey, CACHE_TTL, async () => {
      try {
        const client = this._getClient();
        if (!client) return null;

        // Fincra uses /quotes/generate for conversion rates.
        // We fetch rates for the key supported pairs.
        const FINCRA_PAIRS = [
          { source: 'USD', dest: 'NGN', action: 'send' },
          { source: 'NGN', dest: 'USD', action: 'send' },
          { source: 'EUR', dest: 'NGN', action: 'send' },
          { source: 'GBP', dest: 'NGN', action: 'send' },
        ];

        const rates = {};
        
        await Promise.allSettled(FINCRA_PAIRS.map(async (pair) => {
          try {
            const response = await client.post('/quotes/generate', {
              sourceCurrency: pair.source,
              destinationCurrency: pair.dest,
              amount: 1000, // Use 1000 to get a cleaner rate
              action: pair.action,
              transactionType: 'conversion',
              paymentDestination: 'fliqpay_wallet',
              business: this._businessId,
            }, { timeout: 8000 });

            const data = response.data?.data || response.data;
            if (data && data.rate) {
              const key = `${pair.source}_${pair.dest}`;
              rates[key] = {
                buy: parseFloat(data.rate),
                sell: parseFloat(data.rate),
              };
              logger.info(`[FincraRateProvider] ${key}: rate=${data.rate}`);
            }
          } catch (pairErr) {
            // Individual pair failure is non-fatal
            logger.debug(`[FincraRateProvider] Pair ${pair.source}/${pair.dest} not available: ${pairErr.message}`);
          }
        }));

        if (Object.keys(rates).length > 0) {
          logger.info(`[FincraRateProvider] Fetched ${Object.keys(rates).length} rate pairs from Fincra`);
        }

        return Object.keys(rates).length > 0 ? rates : null;
      } catch (err) {
        logger.warn(`[FincraRateProvider] Rate fetch failed: ${err.message}`);
        return null;
      }
    });
  }

  /**
   * Normalize Fincra's rate response into a consistent format.
   * Handles both array and object response formats.
   * @param {Object} data - Raw Fincra response
   * @returns {Object} - Normalized rates: { 'USD_NGN': { buy: x, sell: y }, ... }
   */
  _normalizeRates(data) {
    const normalized = {};

    try {
      // Format 1: Array of rate objects
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (entry.sourceCurrency && entry.destinationCurrency) {
            const key = `${entry.sourceCurrency}_${entry.destinationCurrency}`;
            normalized[key] = {
              buy: parseFloat(entry.buyRate || entry.rate || 0),
              sell: parseFloat(entry.sellRate || entry.rate || 0),
            };
          }
        }
        return normalized;
      }

      // Format 2: Nested data object (e.g., { data: [...] })
      if (data.data && Array.isArray(data.data)) {
        return this._normalizeRates(data.data);
      }

      // Format 3: Flat key-value (e.g., { USD_NGN: { buy: 1366, sell: 1370 } })
      if (typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          if (key.includes('_') && typeof val === 'object') {
            normalized[key] = {
              buy: parseFloat(val.buy || val.buyRate || val.rate || 0),
              sell: parseFloat(val.sell || val.sellRate || val.rate || 0),
            };
          }
        }
        return normalized;
      }
    } catch (err) {
      logger.warn(`[FincraRateProvider] Normalization error: ${err.message}`);
    }

    return normalized;
  }

  /**
   * Get the exchange rate for a specific currency pair.
   * Returns a standardized rate metadata object.
   * 
   * @param {string} from - Source currency (e.g., 'USD')
   * @param {string} to - Target currency (e.g., 'NGN')
   * @returns {Promise<Object|null>} - { rate, from, to, provider, fetchedAt, source } or null
   */
  async getRate(from, to) {
    const fromUp = from.toUpperCase();
    const toUp = to.toUpperCase();

    if (fromUp === toUp) {
      return { rate: 1.0, from: fromUp, to: toUp, provider: 'fincra', fetchedAt: new Date().toISOString(), source: 'identity' };
    }

    try {
      const rates = await this._fetchRates();
      if (!rates) return null;

      // Try direct pair (e.g., USD_NGN)
      const directKey = `${fromUp}_${toUp}`;
      if (rates[directKey]) {
        const rateVal = rates[directKey].sell || rates[directKey].buy;
        if (rateVal > 0) {
          return {
            rate: rateVal,
            from: fromUp,
            to: toUp,
            provider: 'fincra',
            fetchedAt: new Date().toISOString(),
            source: 'live',
          };
        }
      }

      // Try inverse pair (e.g., NGN_USD) and invert
      const inverseKey = `${toUp}_${fromUp}`;
      if (rates[inverseKey]) {
        const inverseRate = rates[inverseKey].buy || rates[inverseKey].sell;
        if (inverseRate > 0) {
          return {
            rate: 1 / inverseRate,
            from: fromUp,
            to: toUp,
            provider: 'fincra',
            fetchedAt: new Date().toISOString(),
            source: 'live_inverse',
          };
        }
      }

      // Pair not supported by Fincra
      return null;
    } catch (err) {
      logger.warn(`[FincraRateProvider] getRate(${from}, ${to}) failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Get all rates with a given base currency.
   * @param {string} base - Base currency (e.g., 'USD')
   * @returns {Promise<Object|null>} - { NGN: 1366, EUR: 0.87, ... } or null
   */
  async getAllRates(base) {
    const baseUp = base.toUpperCase();

    try {
      const rates = await this._fetchRates();
      if (!rates) return null;

      const result = {};
      for (const [key, val] of Object.entries(rates)) {
        const [from, to] = key.split('_');
        if (from === baseUp) {
          result[to] = val.sell || val.buy;
        } else if (to === baseUp) {
          const inverseRate = val.buy || val.sell;
          if (inverseRate > 0) {
            result[from] = 1 / inverseRate;
          }
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    } catch (err) {
      logger.warn(`[FincraRateProvider] getAllRates(${base}) failed: ${err.message}`);
      return null;
    }
  }
}

module.exports = new FincraRateProvider();
