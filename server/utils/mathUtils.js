const ethers = require("ethers");

/**
 * Math utilities (Hardened v5.4)
 * Using ethers.js BigInt for absolute decimal precision (10^18 standard).
 * No floating point math is permitted for ledger-affecting calculations.
 */

const CALCULATION_DECIMALS = 18; // Standard minor-unit denominator
const ONE_UNIT = ethers.parseUnits("1", CALCULATION_DECIMALS);

// Standard Fee Constants
const ADMIN_FEE_RATE = "0.045";
const PARTNER_FEE_RATE = "0.001";
const REFERRAL_FEE_RATE = "0.001";
const TOTAL_FEE_RATE = "0.047";

/**
 * Sanitize any input to a safe number (NaN/Null -> 0)
 */
function safeNumber(val) {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(num) || !isFinite(num) ? 0 : num;
}

/**
 * Normalizes input to a string for BigInt parsing, preventing e-notation errors.
 */
function normalizeToString(val, decimals = CALCULATION_DECIMALS) {
  const safeVal = safeNumber(val);
  return Number(safeVal).toLocaleString("fullwide", {
    useGrouping: false,
    maximumFractionDigits: decimals,
  });
}

/**
 * Safely parses a value into a BigInt string at 10^18 precision
 */
function parseSafe(amount) {
  return ethers.parseUnits(normalizeToString(amount), CALCULATION_DECIMALS);
}

/**
 * Safely formats a BigInt back to a precision string
 */
function formatSafe(bn) {
  return ethers.formatUnits(bn, CALCULATION_DECIMALS);
}

/**
 * Multiply two numbers safely at 10^18 precision
 */
function multiply(a, b) {
  const bnA = parseSafe(a);
  const bnB = parseSafe(b);
  const result = (bnA * bnB) / ONE_UNIT;
  return formatSafe(result);
}

/**
 * Divide two numbers safely at 10^18 precision
 */
function divide(a, b) {
  const bnA = parseSafe(a);
  const bnB = parseSafe(b);
  if (bnB === 0n) throw new Error("Division by zero");
  const result = (bnA * ONE_UNIT) / bnB;
  return formatSafe(result);
}

/**
 * Compare equality at 10^18 precision
 */
function isEqual(a, b) {
  try {
    return parseSafe(a) === parseSafe(b);
  } catch {
    return false;
  }
}

/**
 * Check if a >= b safely
 */
function isGreaterOrEqual(a, b) {
  try {
    return parseSafe(a) >= parseSafe(b);
  } catch {
    return false;
  }
}

/**
 * Format strictly as a String for final outputs
 */
function formatForCurrency(amount, currency) {
  const fiatCurrencies = ["USD", "NGN", "EUR", "GBP", "JPY"];
  const isFiat = fiatCurrencies.includes(currency.toUpperCase());
  const decimals = isFiat ? 2 : 8;
  const safeVal = safeNumber(amount);
  return Number(safeVal).toFixed(decimals);
}

module.exports = {
  safeNumber,
  parseSafe,
  formatSafe,
  multiply,
  divide,
  isEqual,
  isGreaterOrEqual,
  formatForCurrency,
  CALCULATION_DECIMALS,
  ADMIN_FEE_RATE,
  PARTNER_FEE_RATE,
  REFERRAL_FEE_RATE,
  TOTAL_FEE_RATE,
};

