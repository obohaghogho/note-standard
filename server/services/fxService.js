const coingeckoProvider = require("../providers/coingeckoProvider");
const nowpaymentsProvider = require("../providers/nowpaymentsProvider");
const exchangeRateProvider = require("../providers/exchangeRateProvider");
const logger = require("../utils/logger");
const cache = require("../utils/cache");

/**
 * FX Service
 * Handles currency rates using decoupled providers.
 */
class FXService {
  constructor() {
    this.CRYPTO_CACHE_TTL = 60; // 60 seconds (safe for free tier)
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
  async getCryptoPrice(symbol) {
    const prices = await this.getMultipleCryptoPrices([symbol]);
    return prices[symbol.toUpperCase()] || null;
  }

  /**
   * Get multiple crypto prices in one batch
   */
  async getMultipleCryptoPrices(symbols) {
    const keys = symbols.map((s) => s.toUpperCase());
    const cacheKey = `crypto_batch_${keys.sort().join("_")}`;

    return cache.wrap(
      cacheKey,
      this.CRYPTO_CACHE_TTL,
      async () => {
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
                // NowPayments estimate is usually quite reliable
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
      },
    );
  }

  /**
   * Get exchange rate for any pair (Base -> USD -> Target)
   */
  async getRate(from, to) {
    const fromSym = from.toUpperCase();
    const toSym = to.toUpperCase();
    if (fromSym === toSym) return 1.0;

    try {
      // 1. Get USD value of FROM
      let fromInUsd = 1.0;
      if (fromSym !== "USD") {
        if (this.coinMapping[fromSym]) {
          fromInUsd = await this.getCryptoPrice(fromSym);
        } else {
          fromInUsd = await exchangeRateProvider.getFiatRate(fromSym, "USD");
        }
      }

      // 2. Get value of TARGET in USD
      let usdInTo = 1.0;
      if (toSym !== "USD") {
        if (this.coinMapping[toSym]) {
          const toPrice = await this.getCryptoPrice(toSym);
          usdInTo = toPrice ? 1 / toPrice : null;
        } else {
          usdInTo = await exchangeRateProvider.getFiatRate("USD", toSym);
        }
      }

      if (fromInUsd === null || usdInTo === null) {
        throw new Error(`Pricing unavailable for ${from}/${to}`);
      }

      return fromInUsd * usdInTo;
    } catch (err) {
      logger.error(
        `[FXService] GetRate Error for ${from}/${to}: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * For dashboard display
   */
  async getAllRates(base = "USD") {
    const targets = ["BTC", "ETH", "USDT", "NGN", "USD", "EUR", "GBP", "JPY"];
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
          results[sym] = price ? 1 / price : 0;
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
          results[k] = results[k] / basePrice;
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
