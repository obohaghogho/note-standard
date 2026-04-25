const Decimal = require("decimal.js");

/**
 * Math utilities (Sovereign Ledger Edition v6.0)
 * Using decimal.js for arbitrary-precision arithmetic.
 * This ensures that financial drift caused by IEEE 754 floating point 
 * errors is mathematically eliminated.
 */

// Configure Decimal for high-precision financial operations
Decimal.set({ 
    precision: 40, 
    rounding: Decimal.ROUND_HALF_UP,
    toExpNeg: -20, // Prevents scientific notation for small crypto amounts
    toExpPos: 20 
});

const CALCULATION_DECIMALS = 18;

// Standard Fee Constants
const ADMIN_FEE_RATE = new Decimal("0.045");
const PARTNER_FEE_RATE = new Decimal("0.001");
const REFERRAL_FEE_RATE = new Decimal("0.001");
const TOTAL_FEE_RATE = new Decimal("0.047");

/**
 * Sanitize any input to a Decimal object
 */
function toDecimal(val) {
    if (val === null || val === undefined || val === '') return new Decimal(0);
    try {
        return new Decimal(val);
    } catch (e) {
        return new Decimal(0);
    }
}

/**
 * Safely parses a value into a precision string
 */
function parseSafe(amount) {
    return toDecimal(amount).toFixed(CALCULATION_DECIMALS);
}

/**
 * Safely formats a value back to a precision string
 */
function formatSafe(val) {
    return toDecimal(val).toFixed(CALCULATION_DECIMALS);
}

/**
 * Add two numbers safely
 */
function add(a, b) {
    return toDecimal(a).plus(toDecimal(b)).toFixed(CALCULATION_DECIMALS);
}

/**
 * Subtract b from a safely
 */
function subtract(a, b) {
    return toDecimal(a).minus(toDecimal(b)).toFixed(CALCULATION_DECIMALS);
}

/**
 * Multiply two numbers safely
 */
function multiply(a, b) {
    return toDecimal(a).times(toDecimal(b)).toFixed(CALCULATION_DECIMALS);
}

/**
 * Divide two numbers safely
 */
function divide(a, b) {
    const decB = toDecimal(b);
    if (decB.isZero()) throw new Error("Division by zero");
    return toDecimal(a).div(decB).toFixed(CALCULATION_DECIMALS);
}

/**
 * Compare equality
 */
function isEqual(a, b) {
    return toDecimal(a).equals(toDecimal(b));
}

/**
 * Check if a >= b safely
 */
function isGreaterOrEqual(a, b) {
    return toDecimal(a).greaterThanOrEqualTo(toDecimal(b));
}

/**
 * Format strictly as a String for final outputs
 */
function formatForCurrency(amount, currency) {
    const fiatCurrencies = ["USD", "NGN", "EUR", "GBP", "JPY"];
    const isFiat = fiatCurrencies.includes(currency.toUpperCase());
    const decimals = isFiat ? 2 : 8;
    return toDecimal(amount).toFixed(decimals);
}

module.exports = {
    toDecimal,
    parseSafe,
    formatSafe,
    add,
    subtract,
    multiply,
    divide,
    isEqual,
    isGreaterOrEqual,
    formatForCurrency,
    CALCULATION_DECIMALS,
    ADMIN_FEE_RATE: ADMIN_FEE_RATE.toString(),
    PARTNER_FEE_RATE: PARTNER_FEE_RATE.toString(),
    REFERRAL_FEE_RATE: REFERRAL_FEE_RATE.toString(),
    TOTAL_FEE_RATE: TOTAL_FEE_RATE.toString(),
};
