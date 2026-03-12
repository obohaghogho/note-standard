const ethers = require("ethers");

/**
 * Math utilities using ethers.js BigNumber for safe, precise currency calculations.
 * Avoids native JavaScript floating point precision issues.
 */

const CRYPTO_DECIMALS = 8; // Enforce standard 8-decimal precision for Crypto (Satoshi standard)
const FIAT_DECIMALS = 2;
const FEE_DECIMALS = 4; // Standard for fee rates (e.g., 0.0450)

// Used for high-precision internal calculations
const CALCULATION_DECIMALS = 18;
const ONE_UNIT = ethers.utils.parseUnits("1", CALCULATION_DECIMALS);

// Standard Fee Constants (matching DB defaults in execute_production_swap)
const ADMIN_FEE_RATE = "0.045";
const PARTNER_FEE_RATE = "0.001";
const REFERRAL_FEE_RATE = "0.001";
const TOTAL_FEE_RATE = "0.047";

// Standard Platform Fee Constants (for specific platforms)
const PLATFORM_A_ADMIN_FEE_RATE = "0.03";
const PLATFORM_A_PARTNER_FEE_RATE = "0.005";
const PLATFORM_B_ADMIN_FEE_RATE = "0.025";
const PLATFORM_B_PARTNER_FEE_RATE = "0.002";


/**
 * Determines decimals based on currency code
 */
function getDecimals(currency) {
  const fiatCurrencies = ["USD", "NGN", "EUR", "GBP", "JPY"];
  return fiatCurrencies.includes(currency.toUpperCase())
    ? FIAT_DECIMALS
    : CRYPTO_DECIMALS;
}

/**
 * Safely parses a float string/number into a BigNumber
 */
function parseSafe(amount, decimals = CALCULATION_DECIMALS) {
  // Prevent floating point e-notation bugs in toString()
  const strAmount = typeof amount === "number"
    ? Number(amount).toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: decimals,
    })
    : String(amount);
  return ethers.utils.parseUnits(strAmount, decimals);
}

/**
 * Safely formats a BigNumber back to a float number string
 */
function formatSafe(bn, decimals = CALCULATION_DECIMALS) {
  return ethers.utils.formatUnits(bn, decimals);
}

/**
 * Multiply two numbers safely
 */
function multiply(a, b, decimals = CALCULATION_DECIMALS) {
  const bnA = parseSafe(a, decimals);
  const bnB = parseSafe(b, decimals);
  // When multiplying two numbers with X decimals, the result has 2X decimals.
  // We divide by ONE_UNIT (which has X decimals) to bring it back to X decimals.
  const result = bnA.mul(bnB).div(ethers.utils.parseUnits("1", decimals));
  return formatSafe(result, decimals);
}

/**
 * Divide two numbers safely
 */
function divide(a, b, decimals = CALCULATION_DECIMALS) {
  const bnA = parseSafe(a, decimals);
  const bnB = parseSafe(b, decimals);

  if (bnB.isZero()) throw new Error("Division by zero");

  // Scale up numerator by ONE_UNIT before dividing to maintain precision
  const expandedA = bnA.mul(ethers.utils.parseUnits("1", decimals));
  const result = expandedA.div(bnB);
  return formatSafe(result, decimals);
}

/**
 * Format final output to appropriate decimal places strictly as a String
 * This prevents float manipulation exploits downstream.
 */
function formatForCurrency(amount, currency) {
  const decimals = getDecimals(currency);
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  return Number(value).toFixed(decimals); // Explicit string serialization
}

module.exports = {
  getDecimals,
  parseSafe,
  formatSafe,
  multiply,
  divide,
  formatForCurrency,
  CRYPTO_DECIMALS,
  FIAT_DECIMALS,
  ADMIN_FEE_RATE,
  PARTNER_FEE_RATE,
  REFERRAL_FEE_RATE,
  TOTAL_FEE_RATE,
};
