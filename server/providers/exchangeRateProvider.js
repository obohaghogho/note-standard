const axios = require("axios");
const logger = require("../utils/logger");
const cache = require("../utils/cache");

class ExchangeRateProvider {
  constructor() {
    this.baseUrl = "https://open.er-api.com/v6/latest";
    this.CACHE_TTL = 300; // 5 minutes cache for fiat rates
  }

  async getAllRates(base) {
    const upBase = base.toUpperCase();
    const cacheKey = `fiat_rates_all_${upBase}`;

    return cache.wrap(cacheKey, this.CACHE_TTL, async () => {
      try {
        const frankfurterUrl = `https://api.frankfurter.app/latest?from=${upBase}`;
        const fallbackUrl = `https://open.er-api.com/v6/latest/${upBase}`;

        let rates = null;
        try {
          const response = await axios.get(frankfurterUrl, { timeout: 4000 });
          if (response.data && response.data.rates) {
            rates = response.data.rates;
            rates[upBase] = 1.0;
          }
        } catch (fErr) {
          logger.warn(`[ExchangeRateProvider] Frankfurter failed: ${fErr.message}`);
        }

        if (!rates || !rates["NGN"]) {
          const response = await axios.get(fallbackUrl, { timeout: 5000 });
          if (response.data && response.data.rates) {
            rates = response.data.rates;
          }
        }

        if (!rates) throw new Error("All fiat providers failed");
        return rates;
      } catch (err) {
        logger.error(`[ExchangeRateProvider] Failed to fetch rates for ${upBase}: ${err.message}`);
        return null;
      }
    });
  }

  async getFiatRate(from, to) {
    const upFrom = from.toUpperCase();
    const upTo = to.toUpperCase();
    if (upFrom === upTo) return 1;

    const rates = await this.getAllRates(upFrom);
    return rates ? rates[upTo] : null;
  }
}

module.exports = new ExchangeRateProvider();
