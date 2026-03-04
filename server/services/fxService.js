const axios = require("axios");
const supabase = require("../config/supabase");
const logger = require("../utils/logger");
const nowpaymentsService = require("./nowpaymentsService");
const exchangeRateService = require("./exchangeRateService");

// 1. Configuration constants
const FIAT_CACHE_TTL = 3600 * 1000; // 1 hour for fiat
const CRYPTO_CACHE_TTL = 30 * 1000; // 30 seconds for crypto (high volatility)
const rateCache = new Map();

// Map of currency symbols to CoinGecko IDs
const COINGECKO_ID_MAP = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "USDT": "tether",
  "USDT_TRC20": "tether",
  "USDT_ERC20": "tether",
  "USDT_BEP20": "tether",
  "USDC": "usd-coin",
  "USDC_ERC20": "usd-coin",
  "USDC_POLYGON": "usd-coin",
  "NGN": "nigerian-naira",
  "EUR": "euro",
  "GBP": "british-pound-sterling",
  "JPY": "japanese-yen",
};

/**
 * Get exchange rate for a currency pair
 */
async function getRate(
  from,
  to,
  applyBuffer = false,
  fromNetwork = "native",
  toNetwork = "native",
) {
  if (from === to && fromNetwork === toNetwork) return 1.0;

  try {
    const cacheKey = `${from}_${to}`;
    const cached = rateCache.get(cacheKey);

    // Determine if we are dealing with crypto or fiat
    const isCryptoPair = COINGECKO_ID_MAP[from] && COINGECKO_ID_MAP[to];
    const fromIsCrypto = COINGECKO_ID_MAP[from] &&
      !["EUR", "GBP", "JPY", "NGN"].includes(from);
    const toIsCrypto = COINGECKO_ID_MAP[to] &&
      !["EUR", "GBP", "JPY", "NGN"].includes(to);
    const isFiatPair = !fromIsCrypto && !toIsCrypto;

    // REQUIREMENT: For crypto-to-crypto swaps on specific networks, prioritize provider estimates (NOWPayments)
    if (isCryptoPair && fromNetwork !== "native" && toNetwork !== "native") {
      try {
        const providerRate = await getProviderRate(
          from,
          to,
          1,
          fromNetwork,
          toNetwork,
        );
        if (providerRate) return providerRate;
      } catch (err) {
        logger.warn(
          `[FXService] Provider rate fetch failed for ${from}->${to}, falling back...`,
        );
      }
    }

    // Fetch fresh rate logic
    let rate;

    // RULE: If it's a fiat pair (e.g. USD->NGN, USD->EUR) or for displaying fiat balances,
    // prioritize the dedicated ExchangeRate-API.
    if (isFiatPair) {
      try {
        rate = await exchangeRateService.getFiatRate(from, to);
      } catch (err) {
        logger.warn(
          `[FXService] exchangeRateService primary failed for ${from}->${to}, trying CoinGecko fallback...`,
        );
        rate = await fetchCryptoRate(from, to);
      }
    } else {
      // It's a crypto pair: use CoinGecko as primary
      try {
        rate = await fetchCryptoRate(from, to);
        // Fallback to ExchangeRate-API if crypto API fails and it's a crypto-fiat pair
        if (!rate && (fromIsCrypto !== toIsCrypto)) {
          logger.info(
            `[FXService] Primary crypto API failed for ${from}->${to}, attempting fallback...`,
          );
          rate = await exchangeRateService.getFiatRate(from, to);
        }
      } catch (err) {
        logger.warn(
          `[FXService] Primary crypto API error for ${from}->${to}, attempting fallback...`,
        );
        rate = await exchangeRateService.getFiatRate(from, to);
      }
    }

    if (!rate) {
      // Fallback to old cache if exists, otherwise throw
      if (cached) {
        logger.warn(
          `[FXService] API failed, using expired cache for ${from}->${to}`,
        );
        return cached.rate;
      }
      throw new Error(`Could not resolve rate for ${from}->${to}`);
    }

    // Cache the result
    rateCache.set(cacheKey, { rate, timestamp: Date.now() });
    rateCache.set(`${to}_${from}`, { rate: 1 / rate, timestamp: Date.now() });

    return rate;
  } catch (error) {
    logger.error(`[FXService] getRate Error: ${from}->${to}`, {
      error: error.message,
    });

    // Check if we have any cached value at all (even very old) as absolute fallback
    const cached = rateCache.get(`${from}_${to}`);
    if (cached) return cached.rate;

    // Last resort fallbacks to keep system alive if APIs are down (or 429)
    const fallbacks = {
      "USD_ETH": 0.0003,
      "ETH_USD": 3000,
      "USD_BTC": 0.000015,
      "BTC_USD": 65000,
      "USD_NGN": 1500,
      "NGN_USD": 0.00067,
      "USD_EUR": 0.92,
      "EUR_USD": 1.08,
      "USD_GBP": 0.79,
      "GBP_USD": 1.27,
      "USD_JPY": 150,
      "JPY_USD": 0.0067,
    };
    const key = `${from}_${to}`;
    if (fallbacks[key]) {
      logger.info(`[FXService] Using hardcoded fallback for ${key}`);
      return fallbacks[key];
    }

    // Default to 1.0 if same or completely unknown to prevent 500
    return 1.0;
  }
}

/**
 * Fetch Crypto Rate via CoinGecko
 */
async function fetchCryptoRate(from, to) {
  try {
    const fromId = COINGECKO_ID_MAP[from];
    const toId = COINGECKO_ID_MAP[to];
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    // Case 1: Crypto to Fiat (e.g., BTC -> USD)
    if (fromId && !toId) {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${fromId}&vs_currencies=${toLower}`,
        { timeout: 5000 },
      );
      if (
        response.data && response.data[fromId] &&
        response.data[fromId][toLower] !== undefined
      ) {
        return response.data[fromId][toLower];
      }
    }

    // Case 2: Fiat to Crypto (e.g., USD -> BTC)
    if (!fromId && toId) {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${toId}&vs_currencies=${fromLower}`,
        { timeout: 5000 },
      );
      if (
        response.data && response.data[toId] &&
        response.data[toId][fromLower] !== undefined
      ) {
        const priceInFrom = response.data[toId][fromLower];
        return priceInFrom > 0 ? 1 / priceInFrom : null;
      }
    }

    // Case 3: Crypto to Crypto (e.g., BTC -> ETH)
    if (fromId && toId) {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${fromId},${toId}&vs_currencies=usd`,
        { timeout: 5000 },
      );
      if (response.data && response.data[fromId] && response.data[toId]) {
        const fromPriceUsd = response.data[fromId].usd;
        const toPriceUsd = response.data[toId].usd;
        return (fromPriceUsd && toPriceUsd) ? fromPriceUsd / toPriceUsd : null;
      }
    }
  } catch (err) {
    logger.warn(
      `[FXService] fetchCryptoRate failed: ${from}->${to} - ${err.message}`,
    );
    return null;
  }
  return null;
}

/**
 * Fetch Fiat Rate via dedicated service
 */
async function fetchFiatRate(from, to) {
  try {
    return await exchangeRateService.getFiatRate(from, to);
  } catch (err) {
    return null;
  }
}

async function convert(amount, from, to) {
  const rate = await getRate(from, to);
  return { amount: amount * rate, rate };
}

async function getAllRates(base) {
  // REQUIREMENT: Optimized batch fetching for all supported currencies
  const currencies = [
    "BTC",
    "ETH",
    "USD",
    "NGN",
    "EUR",
    "GBP",
    "JPY",
    "USDT_TRC20",
    "USDT_ERC20",
    "USDT_BEP20",
    "USDC_ERC20",
    "USDC_POLYGON",
  ];
  const results = {};

  // Try to batch fetch as many as possible via CoinGecko
  const cgIds = currencies.map((c) => COINGECKO_ID_MAP[c]).filter(Boolean).join(
    ",",
  );
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=${base.toLowerCase()}`,
      { timeout: 8000 },
    );

    for (const c of currencies) {
      if (c === base) continue;
      const id = COINGECKO_ID_MAP[c];
      if (id && response.data[id] && response.data[id][base.toLowerCase()]) {
        const rate = response.data[id][base.toLowerCase()];
        // If the CoinGecko response is VS_CURRENCY, it gives rate for 1 TOKEN in BASE.
        // E.g. ids=bitcoin, vs_currencies=usd -> bitcoin: { usd: 50000 }
        // So 1 BTC = 50000 USD.
        // Our results[c] should be getRate(BASE, c), i.e., 1 USD = ? BTC.
        // If 1 BTC = 50000 USD, 1 USD = 1/50000 BTC.
        results[c] = rate > 0 ? 1 / rate : 1.0;
      }
    }
  } catch (err) {
    logger.warn(`[FXService] Batch getAllRates failed: ${err.message}`);
  }

  // Final pass: ensure all currencies have a rate (uses Cache or individual calls)
  for (const c of currencies) {
    if (c !== base && !results[c]) {
      try {
        results[c] = await getRate(base, c);
      } catch (err) {
        results[c] = 1.0; // Fail-safe
      }
    }
  }

  return results;
}

/**
 * Fetch rate from NOWPayments provider
 */
async function getProviderRate(from, to, amount = 1, fromNetwork, toNetwork) {
  try {
    const fromTicker = fromNetwork && fromNetwork !== "native"
      ? `${from}_${fromNetwork.toUpperCase()}`
      : from;
    const toTicker = toNetwork && toNetwork !== "native"
      ? `${to}_${toNetwork.toUpperCase()}`
      : to;

    const estimate = await nowpaymentsService.getExchangeEstimate(
      fromTicker,
      toTicker,
      amount,
    );
    return estimate.rate;
  } catch (err) {
    return null;
  }
}

module.exports = {
  getRate,
  convert,
  getAllRates,
  getProviderRate,
};
