const coingeckoProvider = require("../providers/coingeckoProvider");
const exchangeRateProvider = require("../providers/exchangeRateProvider");
const logger = require("../utils/logger");
const cache = require("../utils/cache");

/**
 * FX Service
 * Handles currency rates using decoupled providers.
 */
class FXService {
  constructor() {
    this.CRYPTO_CACHE_TTL = 30; // 30 seconds
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
    const coinId = this.coinMapping[symbol.toUpperCase()];
    if (!coinId) return null;

    return cache.wrap(
      `crypto_price_${symbol.toUpperCase()}`,
      this.CRYPTO_CACHE_TTL,
      async () => {
        try {
          const price = await coingeckoProvider.getPrice(coinId);
          if (price !== null && price !== undefined) return price;
          throw new Error("API returned null price");
        } catch (err) {
          logger.error(
            `[FXService] Crypto Price API failed for ${symbol}: ${err.message}`,
          );
          return null;
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
    const results = {};
    for (const t of targets) {
      try {
        results[t] = await this.getRate(base, t);
      } catch (e) {
        results[t] = 0;
      }
    }
    return results;
  }
}

module.exports = new FXService();
