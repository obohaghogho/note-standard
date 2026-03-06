const axios = require("axios");
const env = require("../config/env");
const logger = require("../utils/logger");

class ExchangeRateProvider {
  constructor() {
    this.apiKey = env.EXCHANGE_RATE_API_KEY;
    this.baseUrl = `https://v6.exchangerate-api.com/v6/${this.apiKey}`;
  }

  async getFiatRate(from, to) {
    if (!this.apiKey) throw new Error("ExchangeRate-API key missing");

    try {
      const response = await axios.get(`${this.baseUrl}/pair/${from}/${to}`);
      return response.data.conversion_rate;
    } catch (err) {
      logger.error(
        `[ExchangeRateProvider] Error for ${from}/${to}: ${err.message}`,
      );
      return null;
    }
  }
}

module.exports = new ExchangeRateProvider();
