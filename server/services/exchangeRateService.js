const axios = require("axios");

let cache = {
  rates: null,
  timestamp: 0,
};

const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch fiat exchange rates using ExchangeRate-API
 * Always fetches latest rates relative to USD (Global Base Model)
 */
async function getFiatRates() {
  const now = Date.now();

  // Return cached rates if still valid
  if (cache.rates && now - cache.timestamp < CACHE_TIME) {
    return cache.rates;
  }

  try {
    const API_KEY = process.env.EXCHANGERATE_API_KEY;
    if (!API_KEY) {
      throw new Error("EXCHANGERATE_API_KEY is not defined");
    }

    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`,
    );

    if (response.data && response.data.conversion_rates) {
      cache = {
        rates: response.data.conversion_rates,
        timestamp: now,
      };
      return cache.rates;
    }

    throw new Error("Invalid response format from ExchangeRate-API");
  } catch (error) {
    console.error(
      "[exchangeRateService] API Failed, attempting stale cache fallback:",
      error.response?.data || error.message,
    );

    if (cache.rates) {
      return cache.rates;
    }

    throw new Error("No fiat exchange rates available (API Down & No Cache)");
  }
}

/**
 * Get a specific fiat rate from the USD-centric cache
 */
async function getFiatRate(from, to) {
  const rates = await getFiatRates();
  const upFrom = from.toUpperCase();
  const upTo = to.toUpperCase();

  // If searching for USD to X
  if (upFrom === "USD") {
    const rate = rates[upTo];
    if (rate === undefined) {
      throw new Error(`Rate for ${to} not found in USD base`);
    }
    return rate;
  }

  // If searching for X to USD
  if (upTo === "USD") {
    const rate = rates[upFrom];
    if (rate === undefined || rate === 0) {
      throw new Error(`Rate for ${from} not found or invalid`);
    }
    return 1 / rate;
  }

  // Cross-rate: X -> USD -> Y (Standardized Routing)
  const fromToUsd = 1 / (rates[upFrom] || 0);
  const usdToTarget = rates[upTo];

  if (!fromToUsd || usdToTarget === undefined) {
    throw new Error(`One or more rates for pair ${from}/${to} unavailable`);
  }

  return fromToUsd * usdToTarget;
}

module.exports = {
  getFiatRates,
  getFiatRate,
};
