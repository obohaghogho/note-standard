const coingeckoProvider = require("../providers/coingeckoProvider");
const nowpaymentsProvider = require("../providers/nowpaymentsProvider");
const exchangeRateProvider = require("../providers/exchangeRateProvider");
const logger = require("../utils/logger");
const cache = require("../utils/cache");
const math = require("../utils/mathUtils");

/**
 * FX Service
 * Handles currency rates using decoupled providers.
 */
class FXService {
  constructor() {
    this.CRYPTO_CACHE_TTL = 30; // 30 seconds (real-time enough for dashboard)
    this.coinMapping = {
      "BTC": "bitcoin",
      "ETH": "ethereum",
      "USDT": "tether",
      "USDC": "usd-coin",
    };
  }

  /**
   * Get price of crypto in USD
   */
  async getCryptoPrice(symbol, useCache = true) {
    const prices = await this.getMultipleCryptoPrices([symbol], useCache);
    return prices[symbol.toUpperCase()] || null;
  }

  /**
   * Get multiple crypto prices in one batch
   */
  async getMultipleCryptoPrices(symbols, useCache = true) {
    const keys = symbols.map((s) => s.toUpperCase());
    const cacheKey = `crypto_batch_${keys.sort().join("_")}`;

    const fetchValues = async () => {
      const coinIds = symbols
        .map((s) => this.coinMapping[s.toUpperCase()])
        .filter(Boolean);

      if (coinIds.length === 0) return {};

      try {
        const results = {};
        try {
          const prices = await coingeckoProvider.getPrices(coinIds);
          symbols.forEach((s) => {
            const id = this.coinMapping[s.toUpperCase()];
            results[s.toUpperCase()] = prices[id] || null;
          });
        } catch (err) {
          logger.warn(
            `[FXService] CoinGecko Batch failed, seeking fallback: ${err.message}`,
          );
        }

        // Fallback for missing/failed assets using NowPayments
        const missing = symbols.filter((s) => !results[s.toUpperCase()]);
        if (missing.length > 0) {
          logger.info(
            `[FXService] Attempting NowPayments fallback for: ${
              missing.join(", ")
            }`,
          );
          for (const sym of missing) {
            try {
              const rate = await nowpaymentsProvider.getRate(sym, "USD");
              if (rate) results[sym.toUpperCase()] = rate;
            } catch (fallbackErr) {
              logger.error(
                `[FXService] Fallback failed for ${sym}: ${fallbackErr.message}`,
              );
            }
          }
        }

        return results;
      } catch (err) {
        logger.error(
          `[FXService] All Crypto Providers failed: ${err.message}`,
        );
        return {};
      }
    };

    if (useCache === false) {
      return await fetchValues();
    }

    return cache.wrap(cacheKey, this.CRYPTO_CACHE_TTL, fetchValues);
  }

  /**
   * Get exchange rate for any pair (Base -> USD -> Target)
   */
  async getRate(from, to, useCache = true) {
    const fromSym = from.toUpperCase();
    const toSym = to.toUpperCase();
    if (fromSym === toSym) return 1.0;

    try {
      // 1. Get USD value of FROM
      let fromInUsd = 1.0;
      if (fromSym !== "USD") {
        if (this.coinMapping[fromSym]) {
          fromInUsd = await this.getCryptoPrice(fromSym, useCache);
        } else {
          // Fiat rates always use provider's internal caching for now as they move slowly
          fromInUsd = await exchangeRateProvider.getFiatRate(fromSym, "USD");
        }
      }

      // 2. Get value of TARGET in USD
      let usdInTo = 1.0;
      if (toSym !== "USD") {
        if (this.coinMapping[toSym]) {
          const toPrice = await this.getCryptoPrice(toSym, useCache);
          usdInTo = toPrice ? math.divide(1, toPrice) : null;
        } else {
          usdInTo = await exchangeRateProvider.getFiatRate("USD", toSym);
        }
      }

        if (fromInUsd === null || usdInTo === null) {
          throw new Error(`Pricing unavailable for ${from}/${to}`);
        }
  
        return math.multiply(fromInUsd, usdInTo);
    } catch (err) {
      logger.error(
        `[FXService] GetRate Error for ${from}/${to}: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Convert amount from one currency to another
   */
  async convert(amount, from, to, useCache = true) {
    const rate = await this.getRate(from, to, useCache);
    return {
      amount: math.multiply(amount, rate),
      rate,
    };
  }

  /**
   * For dashboard display
   */
  async getAllRates(base = "USD") {
    const cryptoCurrencies = Object.keys(this.coinMapping);
    const additionalFiatTargets = ["NGN", "EUR", "GBP", "JPY"];
    const targets = [...new Set([...cryptoCurrencies, ...additionalFiatTargets, "USD"])];
    const cryptoTargets = targets.filter((t) => this.coinMapping[t]);
    const fiatTargets = targets.filter((t) =>
      !this.coinMapping[t] && t !== "USD"
    );

    const results = { "USD": 1.0 };

    try {
      // 1. Batch fetch all crypto prices
      const cryptoPrices = await this.getMultipleCryptoPrices(cryptoTargets);
      Object.keys(cryptoPrices).forEach((sym) => {
        const price = cryptoPrices[sym];
        if (base === "USD") {
          results[sym] = price ? math.divide(1, price) : 0;
        } else {
          // Cross conversion handled via getRate if base isn't USD
          // but usually it's USD for dashboard
        }
      });

      // 2. Fetch fiat rates in parallel
      const fiatPromises = fiatTargets.map(async (t) => {
        try {
          return { symbol: t, rate: await this.getRate(base, t) };
        } catch (e) {
          return { symbol: t, rate: 0 };
        }
      });

      const fiatResults = await Promise.all(fiatPromises);
      fiatResults.forEach(({ symbol, rate }) => {
        results[symbol] = rate;
      });

      // If base isn't USD, normalize everything
      if (base !== "USD") {
        const basePrice = results[base] || 1;
        Object.keys(results).forEach((k) => {
          results[k] = math.divide(results[k], basePrice);
        });
      }

      return results;
    } catch (err) {
      logger.error(`[FXService] GetAllRates Error: ${err.message}`);
      return results;
    }
  }
}

module.exports = new FXService();
