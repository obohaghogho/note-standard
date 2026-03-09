const axios = require("axios");
const logger = require("../utils/logger");
const cache = require("../utils/cache");

class ExchangeRateProvider {
  constructor() {
    this.baseUrl = "https://open.er-api.com/v6/latest";
    this.CACHE_TTL = 300; // 5 minutes cache for fiat rates
  }

  async getFiatRate(from, to) {
    const upFrom = from.toUpperCase();
    const upTo = to.toUpperCase();
    if (upFrom === upTo) return 1;

    const cacheKey = `fiat_rates_${upFrom}`;

    return cache.wrap(cacheKey, this.CACHE_TTL, async () => {
      try {
        // Dual Provider Logic: Frankfurter (Primary) -> ExchangeRate-API (Fallback)
        // Frankfurter is extremely stable but doesn't support NGN.
        // ExchangeRate-API is our fallback for NGN and other missing currencies.
        const frankfurterUrl =
          `https://api.frankfurter.app/latest?from=${upFrom}`;
        const fallbackUrl = `https://open.er-api.com/v6/latest/${upFrom}`;

        let rates = null;
        let providerUsed = "frankfurter";

        try {
          // Attempt Primary: Frankfurter
          const response = await axios.get(frankfurterUrl, { timeout: 4000 });
          if (response.data && response.data.rates) {
            rates = response.data.rates;
            // Frankfurter doesn't include the base in rates list
            rates[upFrom] = 1.0;
          }
        } catch (fErr) {
          logger.warn(
            `[ExchangeRateProvider] Frankfurter failed: ${fErr.message}. Falling back...`,
          );
        }

        // Check if we need fallback (Frankfurter failed OR doesn't support common target like NGN)
        if (!rates || !rates["NGN"]) {
          providerUsed = "exchangerate-api";
          const response = await axios.get(fallbackUrl, { timeout: 5000 });
          if (response.data && response.data.rates) {
            rates = response.data.rates;
          }
        }

        if (!rates) throw new Error("All fiat providers failed");

        logger.info(
          `[ExchangeRateProvider] Success using ${providerUsed} for ${upFrom}`,
        );
        return rates;
      } catch (err) {
        // Implement Negative Caching: cache the null result for a short time
        // to prevent immediate retries during 429 or outages.
        logger.error(
          `[ExchangeRateProvider] Total Provider Failure for ${upFrom}: ${err.message}`,
        );

        // If it's a 429, we should be even more aggressive with negative caching
        const negativeTtl = err.response?.status === 429 ? 60 : 30;
        cache.set(cacheKey, "__FAILED__", negativeTtl);

        return null;
      }
    }).then((rates) => {
      if (rates === "__FAILED__") return null;
      if (rates && rates[upTo]) {
        return rates[upTo];
      }
      return null;
    });
  }
}

module.exports = new ExchangeRateProvider();
