/**
 * currencyMetadata.js
 * =====================
 * This is the CENTRAL REGISTRY for all currency-specific behaviors.
 * Do NOT use JavaScript floats directly for financial logic. Use this
 * registry to normalize values to the provider's expected format.
 */

const Decimal = require("decimal.js");

const CURRENCY_METADATA = {
  USD: {
    symbol: "$",
    decimals: 2,
    smallestUnitName: "cent",
    smallestUnitMultiplier: 100, // 1 USD = 100 cents
  },
  NGN: {
    symbol: "₦",
    decimals: 2,
    smallestUnitName: "kobo",
    smallestUnitMultiplier: 100, // 1 NGN = 100 kobo
  },
  GBP: {
    symbol: "£",
    decimals: 2,
    smallestUnitName: "pence",
    smallestUnitMultiplier: 100, // 1 GBP = 100 pence
  },
  EUR: {
    symbol: "€",
    decimals: 2,
    smallestUnitName: "cent",
    smallestUnitMultiplier: 100, // 1 EUR = 100 cents
  },
  JPY: {
    symbol: "¥",
    decimals: 0,
    smallestUnitName: "yen",
    smallestUnitMultiplier: 1,   // JPY does not use minor units in Stripe/Paystack
  },
  GHS: {
    symbol: "GH₵",
    decimals: 2,
    smallestUnitName: "pesewa",
    smallestUnitMultiplier: 100,
  },
  ZAR: {
    symbol: "R",
    decimals: 2,
    smallestUnitName: "cent",
    smallestUnitMultiplier: 100,
  },
  // Crypto mappings
  BTC: { symbol: "₿", decimals: 8, smallestUnitName: "satoshi", smallestUnitMultiplier: 100000000 },
  ETH: { symbol: "Ξ", decimals: 18, smallestUnitName: "wei", smallestUnitMultiplier: 1e18 },
  USDT: { symbol: "USDT", decimals: 6, smallestUnitName: "microUSDT", smallestUnitMultiplier: 1000000 },
  USDC: { symbol: "USDC", decimals: 6, smallestUnitName: "microUSDC", smallestUnitMultiplier: 1000000 },
};

/**
 * Normalizes an amount into its smallest unit based on the currency rules.
 * Examples:
 *   normalizeToSmallestUnit(50.50, "USD") => 5050 (cents)
 *   normalizeToSmallestUnit(500, "JPY") => 500 (yen)
 * 
 * @param {number|string} amount 
 * @param {string} currency 
 * @returns {number} The integer value of the smallest unit
 */
function normalizeToSmallestUnit(amount, currency) {
  const upCurrency = String(currency).toUpperCase();
  const metadata = CURRENCY_METADATA[upCurrency];

  if (!metadata) {
    throw new Error(`[CurrencyMetadata] Unsupported currency for normalization: ${currency}`);
  }

  // Use Decimal.js to prevent JS float precision bugs (e.g., 0.1 + 0.2)
  const decAmount = new Decimal(amount);
  const normalized = decAmount.times(metadata.smallestUnitMultiplier);
  
  // Must return an integer for payment gateways
  return Math.round(normalized.toNumber());
}

/**
 * Converts a smallest unit back to its standard display format.
 * Examples:
 *   formatFromSmallestUnit(5050, "USD") => 50.50
 * 
 * @param {number|string} smallestUnitAmount 
 * @param {string} currency 
 * @returns {number} The standard unit amount
 */
function formatFromSmallestUnit(smallestUnitAmount, currency) {
  const upCurrency = String(currency).toUpperCase();
  const metadata = CURRENCY_METADATA[upCurrency];

  if (!metadata) {
    throw new Error(`[CurrencyMetadata] Unsupported currency for formatting: ${currency}`);
  }

  const decAmount = new Decimal(smallestUnitAmount);
  return decAmount.dividedBy(metadata.smallestUnitMultiplier).toDecimalPlaces(metadata.decimals).toNumber();
}

/**
 * Returns metadata for a currency.
 */
function getMetadata(currency) {
  const upCurrency = String(currency).toUpperCase();
  const metadata = CURRENCY_METADATA[upCurrency];
  if (!metadata) {
    throw new Error(`[CurrencyMetadata] Unknown currency: ${currency}`);
  }
  return metadata;
}

module.exports = {
  CURRENCY_METADATA,
  normalizeToSmallestUnit,
  formatFromSmallestUnit,
  getMetadata,
};
