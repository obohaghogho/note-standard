/**
 * providerCapabilities.js
 * =======================
 * Registry defining exactly what each payment provider supports.
 * This abstracts away hardcoded assumptions in the codebase.
 */

const PAYMENT_PROVIDER_CAPABILITIES = {
  paystack: {
    // Paystack supports NGN natively. EUR, GBP, USD are supported via International Payments.
    // ZAR, GHS, KES, EGP are regional African currencies.
    supportedCurrencies: ["NGN", "USD", "EUR", "GBP", "ZAR", "GHS", "KES", "EGP"],
    supportsInternational: true,
    requiresSmallestUnit: true, // Requires cents/kobo
    settlementCurrencies: ["NGN", "USD", "EUR", "GBP"], // Configured on their dashboard
  },
  grey: {
    supportedCurrencies: ["USD", "EUR", "GBP"],
    supportsInternational: true,
    requiresSmallestUnit: false, // Usually accepts decimal amounts
    settlementCurrencies: ["USD", "EUR", "GBP"],
  },
  nowpayments: {
    supportedCurrencies: ["BTC", "ETH", "USDT", "USDC", "MATIC", "XRP"],
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ["USDT", "USDC"],
  },
};

/**
 * Checks if a provider supports processing a specific currency natively.
 * @param {string} providerName 
 * @param {string} currency 
 * @returns {boolean}
 */
function supportsCurrency(providerName, currency) {
  const provider = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!provider) return false;
  return provider.supportedCurrencies.includes(String(currency).toUpperCase());
}

/**
 * Validates provider existence and returns capabilities.
 */
function getProviderCapabilities(providerName) {
  const provider = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!provider) {
    throw new Error(`[ProviderRegistry] Unknown provider: ${providerName}`);
  }
  return provider;
}

module.exports = {
  PAYMENT_PROVIDER_CAPABILITIES,
  supportsCurrency,
  getProviderCapabilities,
};
