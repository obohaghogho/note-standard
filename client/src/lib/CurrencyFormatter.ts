/**
 * Currency Formatter Utility
 * Uses Intl.NumberFormat for production-grade localization.
 * Hardened v5.4 with Zero-NaN Policy.
 */

export const formatCurrency = (amount: number | string | null | undefined, currency: string | null | undefined) => {
  const supportedFiatCurrencies = ["USD", "EUR", "GBP", "NGN", "JPY"];
  
  // 1. Ingestion Protection: Convert to number and check validity
  const rawAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const safeAmount = (rawAmount === null || rawAmount === undefined || isNaN(rawAmount) || !isFinite(rawAmount)) ? 0 : rawAmount;
  
  const safeCurrency = (currency || 'USD').toUpperCase();

  if (supportedFiatCurrencies.includes(safeCurrency)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: safeCurrency === 'JPY' ? 0 : 2,
      maximumFractionDigits: safeCurrency === 'JPY' ? 0 : 2
    }).format(safeAmount);
  }

  // 2. Crypto Formatting: Enforce standard precision for digital assets
  const cryptoDecimals = ['BTC', 'ETH'].includes(safeCurrency) ? 8 : 4;
  return `${safeAmount.toLocaleString('en-US', {
      minimumFractionDigits: cryptoDecimals,
      maximumFractionDigits: cryptoDecimals
  })} ${safeCurrency.replace('_', ' ')}`;
};

/**
 * Helper to determine decimal places based on currency type
 */
// getDecimalPlaces removed (unused)

/**
 * Detect user's suggested currency based on locale
 */
export const detectLocalCurrency = (locale: string = navigator.language): string => {
  try {
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD', // Dummy code to get parts
    }).formatToParts(1);
    
    // This is tricky, a better way is mapping country from locale
    // In production, we'd use a locale-to-currency mapping table or an IP-based service
    return getCurrencyFromLocale(locale);
  } catch {
    return 'USD';
  }
};

const getCurrencyFromLocale = (locale: string): string => {
  const region = locale.split('-')[1] || locale.toUpperCase();
  const mapping: Record<string, string> = {
    'US': 'USD',
    'GB': 'GBP',
    'EU': 'EUR',
    'DE': 'EUR',
    'FR': 'EUR',
    'NG': 'NGN',
    'IN': 'INR',
    'ZA': 'ZAR',
    'JP': 'JPY',
    'CN': 'CNY',
    'BR': 'BRL',
    'CA': 'CAD',
    'AU': 'AUD'
  };
  return mapping[region] || 'USD';
};
