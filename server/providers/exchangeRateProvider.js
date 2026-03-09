const axios = require("axios");
const logger = require("../utils/logger");

class ExchangeRateProvider {
  constructor() {
    this.baseUrl = "https://open.er-api.com/v6/latest";
  }

  async getFiatRate(from, to) {
    try {
      const upFrom = from.toUpperCase();
      const upTo = to.toUpperCase();
      if (upFrom === upTo) return 1;

      const apiKey = process.env.EXCHANGERATE_API_KEY;
      const url = apiKey
        ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${upFrom}`
        : `${this.baseUrl}/${upFrom}`;

      const response = await axios.get(url, { timeout: 5000 });

      if (
        response.data && response.data.conversion_rates &&
        response.data.conversion_rates[upTo]
      ) {
        return response.data.conversion_rates[upTo];
      }

      // Fallback for v4 style response (used by open.er-api.com)
      if (response.data && response.data.rates && response.data.rates[upTo]) {
        return response.data.rates[upTo];
      }

      throw new Error(`Rate for ${upTo} not found in response`);
    } catch (err) {
      logger.error(
        `[ExchangeRateProvider] Error for ${from}/${to}: ${err.message}`,
      );
      return null;
    }
  }
}

module.exports = new ExchangeRateProvider();
