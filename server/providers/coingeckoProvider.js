const axios = require("axios");
const logger = require("../utils/logger");
const env = require("../config/env");

class CoinGeckoProvider {
  constructor() {
    this.baseUrl = env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";
    this.apiKey = env.CG_API_KEY;
  }

  async getPrice(coinId, vsCurrency = "usd") {
    try {
      const response = await axios.get(
        `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`,
        this.apiKey ? { headers: { "x-cg-demo-api-key": this.apiKey } } : {},
      );
      return response.data[coinId]?.[vsCurrency];
    } catch (err) {
      logger.error(`[CoinGeckoProvider] Error for ${coinId}: ${err.message}`);
      return null;
    }
  }
}

module.exports = new CoinGeckoProvider();
