/**
 * Currency Formatter Utility
 * Uses Intl.NumberFormat for production-grade localization
 */

export const formatCurrency = (amount: number | null | undefined, currency: string | null | undefined) => {
  const supportedFiatCurrencies = ["USD", "EUR", "GBP", "NGN", "JPY"];
  
  // Guard against null/undefined
  const safeAmount = amount ?? 0;
  const safeCurrency = (currency || 'USD').toUpperCase();

  if (supportedFiatCurrencies.includes(safeCurrency)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency
    }).format(safeAmount);
  }

  // For crypto like USDT, BTC, etc.
  return `${safeAmount.toFixed(getDecimalPlaces(safeCurrency))} ${safeCurrency.replace('_', ' ')}`;
};

/**
 * Helper to determine decimal places based on currency type
 */
const getDecimalPlaces = (currency: string | null | undefined): number => {
  const code = (currency || 'USD').toUpperCase();
  
  // Crypto typically shown with more precision
  if (['BTC', 'ETH', 'SOL'].includes(code)) return 6;
  
  // Zero-decimal currencies
  if (['JPY', 'KRW', 'VND'].includes(code)) return 0;
  
  // Default for fiat
  return 2;
};

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
