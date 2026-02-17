/**
 * Currency Formatter Utility
 * Uses Intl.NumberFormat for production-grade localization
 */

export const formatCurrency = (
  amount: number | string,
  currencyCode: string = 'USD',
  locale: string = navigator.language || 'en-US'
): string => {
  if (amount === undefined || amount === null) return '0.00';
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numericAmount)) return '0.00';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: getDecimalPlaces(currencyCode),
      maximumFractionDigits: getDecimalPlaces(currencyCode),
    }).format(numericAmount);
  } catch (error) {
    // Fallback if currency code is invalid or unsupported
    console.error(`[CurrencyFormatter] Formatting failed for ${currencyCode}:`, error);
    return `${currencyCode.toUpperCase()} ${numericAmount.toFixed(2)}`;
  }
};

/**
 * Helper to determine decimal places based on currency type
 */
const getDecimalPlaces = (currency: string): number => {
  const code = currency.toUpperCase();
  
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
