const axios = require("axios");
const logger = require("../utils/logger");
const env = require("../config/env");

class CoinGeckoProvider {
  constructor() {
    this.baseUrl = env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";
    this.apiKey = env.CG_API_KEY;
  }

  async getPrice(coinId, vsCurrency = "usd") {
    const prices = await this.getPrices([coinId], vsCurrency);
    return prices[coinId] || null;
  }

  async getPrices(coinIds, vsCurrency = "usd") {
    try {
      const ids = coinIds.join(",");
      const response = await axios.get(
        `${this.baseUrl}/simple/price?ids=${ids}&vs_currencies=${vsCurrency}`,
        {
          headers: this.apiKey ? { "x-cg-demo-api-key": this.apiKey } : {},
          timeout: 10000,
        },
      );

      const results = {};
      coinIds.forEach((id) => {
        results[id] = response.data[id]?.[vsCurrency] || null;
      });
      return results;
    } catch (err) {
      if (err.response?.status === 429) {
          logger.error(`[CoinGeckoProvider] 429 Rate Limit Detected for ${coinIds}. Escalating.`);
          const rateErr = new Error("RATE_LIMIT_EXCEEDED");
          rateErr.status = 429;
          throw rateErr;
      }

      logger.error(
        `[CoinGeckoProvider] Batch Error for ${coinIds}: ${err.message}`,
      );
      return {};
    }
  }
}

module.exports = new CoinGeckoProvider();
