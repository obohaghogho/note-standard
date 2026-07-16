// ============================================================================
// Money Utilities — Safe integer-based currency conversions
// ============================================================================
// All internal amounts are stored as BIGINT in minor units (kobo, cents, etc.)
// These utilities prevent floating-point errors by converting to/from integers.
// ============================================================================

/**
 * Known currency configurations.
 * For dynamic lookup from the `supported_currencies` table, use
 * `toMinorUnitDynamic` / `toMajorUnitDynamic` with the factor parameter.
 */
const CURRENCY_FACTORS: Record<string, number> = {
  NGN: 100,           // kobo
  USD: 100,           // cents
  EUR: 100,           // cents
  GBP: 100,           // pence
  BTC: 100_000_000,   // satoshi
  ETH: 1_000_000_000, // gwei (simplified)
  USDT: 1_000_000,    // micro
  USDC: 1_000_000,    // micro
};

/**
 * Converts a human-readable amount to minor units.
 *
 * @example
 * toMinorUnit(500.00, 'NGN') // => 50000 (kobo)
 * toMinorUnit(0.005, 'BTC')  // => 500000 (satoshi)
 *
 * @param amount - The human-readable amount (e.g., 500.00)
 * @param currency - Currency code (e.g., 'NGN')
 * @returns Amount in minor units as an integer
 * @throws If currency is unknown
 */
export function toMinorUnit(amount: number, currency: string): number {
  const factor = CURRENCY_FACTORS[currency.toUpperCase()];
  if (factor === undefined) {
    throw new Error(`Unknown currency: ${currency}. Use toMinorUnitDynamic with an explicit factor.`);
  }
  return Math.round(amount * factor);
}

/**
 * Converts minor units back to a human-readable amount.
 *
 * @example
 * toMajorUnit(50000, 'NGN') // => 500.00
 *
 * @param minorAmount - Amount in minor units (e.g., 50000 kobo)
 * @param currency - Currency code
 * @returns Human-readable amount
 */
export function toMajorUnit(minorAmount: number, currency: string): number {
  const factor = CURRENCY_FACTORS[currency.toUpperCase()];
  if (factor === undefined) {
    throw new Error(`Unknown currency: ${currency}. Use toMajorUnitDynamic with an explicit factor.`);
  }
  return minorAmount / factor;
}

/**
 * Converts to minor units using an explicit factor from the database.
 * Use this when the currency might not be in CURRENCY_FACTORS.
 */
export function toMinorUnitDynamic(amount: number, factor: number): number {
  return Math.round(amount * factor);
}

/**
 * Converts from minor units using an explicit factor from the database.
 */
export function toMajorUnitDynamic(minorAmount: number, factor: number): number {
  return minorAmount / factor;
}

/**
 * Formats a minor-unit amount as a human-readable currency string.
 *
 * @example
 * formatMoney(50000, 'NGN') // => "₦500.00"
 */
export function formatMoney(minorAmount: number, currency: string): string {
  const symbols: Record<string, string> = {
    NGN: '₦',
    USD: '$',
    EUR: '€',
    GBP: '£',
    BTC: '₿',
    ETH: 'Ξ',
    USDT: '₮',
    USDC: 'USDC ',
  };

  const major = toMajorUnit(minorAmount, currency);
  const symbol = symbols[currency.toUpperCase()] || `${currency} `;
  const factor = CURRENCY_FACTORS[currency.toUpperCase()] || 100;

  // Determine decimal places from factor
  const decimals = Math.log10(factor);

  return `${symbol}${major.toFixed(decimals)}`;
}

/**
 * Validates that an amount is a positive integer (minor units).
 */
export function isValidMinorAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0;
}

/**
 * Validates that a major-unit amount is positive and not excessively precise.
 */
export function isValidMajorAmount(amount: number, currency: string): boolean {
  if (amount <= 0 || !Number.isFinite(amount)) return false;
  const factor = CURRENCY_FACTORS[currency.toUpperCase()];
  if (!factor) return false;

  // Check that amount doesn't have more decimal places than the currency supports
  const decimals = Math.log10(factor);
  const multiplied = amount * factor;
  return Math.abs(multiplied - Math.round(multiplied)) < 0.001;
}
