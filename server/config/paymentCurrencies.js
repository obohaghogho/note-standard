/**
 * paymentCurrencies.js
 * ====================
 * Single Source of Truth for Global Multi-Currency Routing & Country Defaults
 * NoteStandard Financial Platform v4
 */

// All currencies the NoteStandard platform accepts from users
const SUPPORTED_APP_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD'];

// Crypto currencies handled by NowPayments
const SUPPORTED_CRYPTO_CURRENCIES = ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP'];

// Country ISO 3166-1 alpha-2 → default fiat currency
const COUNTRY_CURRENCY_DEFAULTS = {
  NG: 'NGN', // Nigeria
  US: 'USD', // United States
  CA: 'CAD', // Canada
  AU: 'AUD', // Australia
  NZ: 'NZD', // New Zealand
  GB: 'GBP', // United Kingdom
  DE: 'EUR', // Germany
  FR: 'EUR', // France
  ES: 'EUR', // Spain
  IT: 'EUR', // Italy
  NL: 'EUR', // Netherlands
  BE: 'EUR', // Belgium
  AT: 'EUR', // Austria
  IE: 'EUR', // Ireland
  FI: 'EUR', // Finland
  PT: 'EUR', // Portugal
  GR: 'EUR', // Greece
  LU: 'EUR', // Luxembourg
  MT: 'EUR', // Malta
  CY: 'EUR', // Cyprus
  SK: 'EUR', // Slovakia
  SI: 'EUR', // Slovenia
  EE: 'EUR', // Estonia
  LV: 'EUR', // Latvia
  LT: 'EUR', // Lithuania
  JP: 'JPY', // Japan
};

// Minimum and maximum transaction amounts per currency (in base units)
const CURRENCY_LIMITS = {
  NGN: { min: 100,    max: 10_000_000 },  // ₦1 – ₦100,000
  USD: { min: 1,      max: 50_000 },       // $1 – $50,000
  EUR: { min: 1,      max: 50_000 },       // €1 – €50,000
  GBP: { min: 1,      max: 50_000 },       // £1 – £50,000
  JPY: { min: 100,    max: 7_000_000 },    // ¥100 – ¥7,000,000
  AUD: { min: 1,      max: 50_000 },       // A$1 – A$50,000
  CAD: { min: 1,      max: 50_000 },       // C$1 – C$50,000
  NZD: { min: 1,      max: 50_000 },       // NZ$1 – NZ$50,000
};

// Decimal precision per currency
const CURRENCY_DECIMALS = {
  NGN: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0, // JPY has no sub-unit
  AUD: 2,
  CAD: 2,
  NZD: 2,
  BTC: 8,
  ETH: 8,
  USDT: 2,
  USDC: 2,
};

/**
 * Resolves the default currency for a given ISO country code.
 * Falls back to USD if not mapped.
 * @param {string} countryCode
 * @returns {string}
 */
function getDefaultCurrencyForCountry(countryCode) {
  if (!countryCode) return 'USD';
  return COUNTRY_CURRENCY_DEFAULTS[String(countryCode).toUpperCase().trim()] || 'USD';
}

/**
 * Returns true if the given currency is a supported fiat app currency.
 * @param {string} currency
 * @returns {boolean}
 */
function isSupportedFiatCurrency(currency) {
  if (!currency) return false;
  return SUPPORTED_APP_CURRENCIES.includes(String(currency).toUpperCase().trim());
}

/**
 * Returns true if the given currency is a supported crypto.
 * @param {string} currency
 * @returns {boolean}
 */
function isSupportedCryptoCurrency(currency) {
  if (!currency) return false;
  return SUPPORTED_CRYPTO_CURRENCIES.includes(String(currency).toUpperCase().trim());
}

/**
 * Normalises currency string to uppercase.
 * @param {string} currency
 * @returns {string}
 */
function normaliseCurrency(currency) {
  return String(currency).toUpperCase().trim();
}

/**
 * Returns the number of decimal places for a currency.
 * @param {string} currency
 * @returns {number}
 */
function getCurrencyDecimals(currency) {
  return CURRENCY_DECIMALS[normaliseCurrency(currency)] ?? 2;
}

/**
 * Returns min/max limits for a currency.
 * @param {string} currency
 * @returns {{ min: number, max: number }}
 */
function getCurrencyLimits(currency) {
  return CURRENCY_LIMITS[normaliseCurrency(currency)] || { min: 1, max: 100_000 };
}

module.exports = {
  SUPPORTED_APP_CURRENCIES,
  SUPPORTED_CRYPTO_CURRENCIES,
  COUNTRY_CURRENCY_DEFAULTS,
  CURRENCY_LIMITS,
  CURRENCY_DECIMALS,
  getDefaultCurrencyForCountry,
  isSupportedFiatCurrency,
  isSupportedCryptoCurrency,
  normaliseCurrency,
  getCurrencyDecimals,
  getCurrencyLimits,
};
