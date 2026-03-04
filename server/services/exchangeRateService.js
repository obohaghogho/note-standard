const axios = require("axios");

/**
 * Fetch fiat exchange rate using ExchangeRate-API
 * https://www.exchangerate-api.com/docs/latest-rates-endpoint
 */
async function getFiatRate(from, to) {
  try {
    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGERATE_API_KEY}/latest/${from.toUpperCase()}`,
    );

    const rate = response.data.conversion_rates[to.toUpperCase()];

    if (rate === undefined) {
      throw new Error(`Rate for ${to} not found in conversion_rates`);
    }

    return rate;
  } catch (error) {
    console.error(
      "Fallback rate error:",
      error.response?.data || error.message,
    );
    throw new Error("Unable to fetch exchange rate");
  }
}

module.exports = {
  getFiatRate,
};
