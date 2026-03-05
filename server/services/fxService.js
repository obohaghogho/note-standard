const axios = require("axios");
const supabase = require("../config/supabase");
const logger = require("../utils/logger");
const nowpaymentsService = require("./nowpaymentsService");
const exchangeRateService = require("./exchangeRateService");

// 1. Configuration constants
const FIAT_CACHE_TTL = 3600 * 1000; // 1 hour for fiat
const CRYPTO_CACHE_TTL = 30 * 1000; // 30 seconds for crypto (high volatility)
const rateCache = new Map();

// Currency classification helpers
const CRYPTO_CURRENCIES = ["BTC", "ETH", "USDT", "USDC", "MATIC", "SOL"];
const FIAT_CURRENCIES = ["USD", "NGN", "EUR", "GBP", "JPY", "CAD"];

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
  const fromSym = from.toUpperCase().split("_")[0];
  const toSym = to.toUpperCase().split("_")[0];

  if (fromSym === toSym && fromNetwork === toNetwork) return 1.0;

  // ── CORE ARCHITECTURE: USD BASE MODEL ──
  // All internal price routing goes through USD to ensure parity and prevent split-pricing.
  // Model: Base(A) -> USD -> Target(B)
  if (fromSym !== "USD" && toSym !== "USD") {
    const rateToUsd = await getRate(from, "USD");
    const rateUsdToTarget = await getRate("USD", to);
    return rateToUsd * rateUsdToTarget;
  }

  try {
    const cacheKey = `${from}_${to}_${fromNetwork}_${toNetwork}`;
    const cached = rateCache.get(cacheKey);

    // Dynamic TTL: Fiat is stable, Crypto is volatile
    const isCrypto = CRYPTO_CURRENCIES.includes(fromSym) ||
      CRYPTO_CURRENCIES.includes(toSym);
    const ttl = isCrypto ? CRYPTO_CACHE_TTL : FIAT_CACHE_TTL;

    if (cached && (Date.now() - cached.timestamp < ttl)) {
      return cached.rate;
    }

    // 1. Try to fetch live rate (Crypto from NOWPayments, Fiat from ExchangeRate-API)
    let liveRate = null;
    if (isCrypto) {
      try {
        liveRate = await getProviderRate(from, to, 1, fromNetwork, toNetwork);
      } catch (err) {
        logger.warn(
          `[FXService] NOWPayments failed for ${from}->${to}: ${err.message}`,
        );
      }
    } else {
      try {
        liveRate = await exchangeRateService.getFiatRate(fromSym, toSym);
      } catch (err) {
        logger.error(
          `[FXService] ExchangeRate-API failed for ${from}->${to}: ${err.message}`,
        );
      }
    }

    // 2. Fallback to cache if live rate failed
    if (liveRate) {
      rateCache.set(cacheKey, { rate: liveRate, timestamp: Date.now() });
      return liveRate;
    } else if (cached) {
      logger.warn(
        `[FXService] APIs failed. Using stale cache for ${from}->${to}`,
      );
      return cached.rate;
    }

    // 3. Block swap if both fail (Never return 1.0)
    logger.error(
      `[FXService] CRITICAL: No live or cached rate available for ${from}->${to}`,
    );
    throw new Error(`Pricing temporarily unavailable for ${from}->${to}`);
  } catch (error) {
    // We explicitly throw here to ensure the swap is blocked upstream
    logger.error(`[FXService] Critical Rate Fetch Error: ${from}->${to}`, {
      error: error.message,
    });
    throw new Error(`Pricing temporarily unavailable for ${from}->${to}`);
  }
}

/**
 * Convert amount
 */
async function convert(amount, from, to) {
  const rate = await getRate(from, to);
  return { amount: amount * rate, rate };
}

/**
 * Get all rates for a base currency
 */
async function getAllRates(base) {
  const currencies = [
    "BTC",
    "ETH",
    "USDT",
    "USDC",
    "USD",
    "NGN",
    "EUR",
    "GBP",
  ];

  const results = {};
  for (const c of currencies) {
    if (c === base.toUpperCase()) continue;
    try {
      results[c] = await getRate(base, c);
    } catch (err) {
      results[c] = 1.0;
    }
  }

  return results;
}

/**
 * Fetch rate from NOWPayments provider
 */
async function getProviderRate(from, to, amount = 1, fromNetwork, toNetwork) {
  try {
    const fromTicker =
      fromNetwork && fromNetwork !== "native" && fromNetwork !== "internal"
        ? `${from}_${fromNetwork.toUpperCase()}`
        : from;
    const toTicker =
      toNetwork && toNetwork !== "native" && toNetwork !== "internal"
        ? `${to}_${toNetwork.toUpperCase()}`
        : to;

    const estimate = await nowpaymentsService.getExchangeEstimate(
      fromTicker,
      toTicker,
      amount,
    );
    return estimate.rate;
  } catch (err) {
    throw err;
  }
}

module.exports = {
  getRate,
  convert,
  getAllRates,
  getProviderRate,
};
