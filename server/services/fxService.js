const axios = require("axios");
const supabase = require("../config/supabase");
const logger = require("../utils/logger");

// 1. Configuration constants
const FIAT_CACHE_TTL = 3600 * 1000; // 1 hour for fiat
const CRYPTO_CACHE_TTL = 30 * 1000; // 30 seconds for crypto (high volatility)
const rateCache = new Map();

// Map of currency symbols to CoinGecko IDs
const COINGECKO_ID_MAP = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "USDT": "tether",
  "USDC": "usd-coin",
  "NGN": "nigerian-naira",
  "EUR": "euro",
  "GBP": "british-pound-sterling",
  "JPY": "japanese-yen",
};

/**
 * Get exchange rate for a currency pair
 */
async function getRate(from, to, applyBuffer = false) {
  if (from === to) return 1.0;

  try {
    const cacheKey = `${from}_${to}`;
    const cached = rateCache.get(cacheKey);

    // Determine TTL based on whether it's crypto or tracked fiat
    const isCryptoOrTracked = COINGECKO_ID_MAP[from] || COINGECKO_ID_MAP[to];
    const ttl = isCryptoOrTracked ? CRYPTO_CACHE_TTL : FIAT_CACHE_TTL;

    if (cached && (Date.now() - cached.timestamp < ttl)) {
      return cached.rate;
    }

    // Fetch fresh rate
    let rate;

    // Logic: If either is tracked (crypto or specific fiat), we use CoinGecko
    if (isCryptoOrTracked) {
      rate = await fetchCryptoRate(from, to);
    } else {
      // Try ExchangeRate-API if key exists
      rate = await fetchFiatRate(from, to);

      // Fallback to CoinGecko if ExchangeRate-API fails/is unconfigured
      if (!rate) {
        rate = await fetchCryptoRate(from, to);
      }
    }

    if (!rate) throw new Error(`Could not resolve rate for ${from}->${to}`);

    // Cache the result
    rateCache.set(cacheKey, { rate, timestamp: Date.now() });
    rateCache.set(`${to}_${from}`, { rate: 1 / rate, timestamp: Date.now() });

    return rate;
  } catch (error) {
    logger.error(`[FXService] getRate Error: ${from}->${to}`, {
      error: error.message,
    });
    // Return null or rethrow to indicate real failure instead of fake values
    throw error;
  }
}

/**
 * Fetch Crypto Rate via CoinGecko
 */
async function fetchCryptoRate(from, to) {
  // We use USD as the base for all CoinGecko comparisons
  const fromId = COINGECKO_ID_MAP[from];
  const toId = COINGECKO_ID_MAP[to];

  // Case 1: Crypto to Fiat (e.g., BTC -> USD)
  if (fromId && !toId) {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${fromId}&vs_currencies=${to.toLowerCase()}`,
    );
    return response.data[fromId][to.toLowerCase()];
  }

  // Case 2: Fiat to Crypto (e.g., USD -> BTC)
  if (!fromId && toId) {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${toId}&vs_currencies=${from.toLowerCase()}`,
    );
    const priceInFrom = response.data[toId][from.toLowerCase()];
    return 1 / priceInFrom;
  }

  // Case 3: Crypto to Crypto (e.g., BTC -> ETH)
  if (fromId && toId) {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${fromId},${toId}&vs_currencies=usd`,
    );
    const fromPriceUsd = response.data[fromId].usd;
    const toPriceUsd = response.data[toId].usd;
    return fromPriceUsd / toPriceUsd;
  }

  return null;
}

/**
 * Fetch Fiat Rate via ExchangeRate-API
 */
async function fetchFiatRate(from, to) {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) return null;

  const response = await axios.get(
    `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`,
  );
  return response.data.conversion_rate;
}

async function convert(amount, from, to) {
  const rate = await getRate(from, to);
  return { amount: amount * rate, rate };
}

async function getAllRates(base) {
  // Simplified for legacy support
  const currencies = ["BTC", "ETH", "USD", "NGN"];
  const results = {};
  for (const c of currencies) {
    if (c !== base) results[c] = await getRate(base, c);
  }
  return results;
}

module.exports = {
  getRate,
  convert,
  getAllRates,
};
