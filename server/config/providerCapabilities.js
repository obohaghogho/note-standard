/**
 * providerCapabilities.js
 * =======================
 * Registry: what each gateway supports & merchant-level feature flags.
 * Multi-Currency Payment Engine v4 — NoteStandard Global Financial Platform
 */

const PAYMENT_PROVIDER_CAPABILITIES = {
  paystack: {
    name: 'paystack',
    capabilityVersion: 1,
    supportedCurrencies: ['NGN', 'USD', 'ZAR', 'GHS', 'KES', 'EGP'],
    merchantCurrencies: ['NGN', 'USD'],
    nativeCurrencies: ['NGN', 'USD'],
    fallbackCurrencies: ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD'],
    merchantEnabled: true,
    cardEnabled: true,
    subscriptionEnabled: true,
    dvaEnabled: true,
    refundsEnabled: true,
    supportsInternational: true,
    requiresSmallestUnit: true,
    settlementCurrencies: ['NGN', 'USD'],
    feeEfficiencyScore: 10,
    methods: ['card', 'bank_transfer', 'dva', 'subscription'],
    supportedFeatures: {
      checkout: true,
      cardPayments: true,
      bankTransfers: true,
      virtualAccounts: true,
      subscriptions: true,
      refunds: true,
      stablecoins: false,
      treasury: false
    }
  },

  fincra: {
    name: 'fincra',
    capabilityVersion: 1,
    supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    merchantCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    nativeCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    fallbackCurrencies: ['JPY', 'AUD', 'CAD', 'NZD'],
    merchantEnabled: true,
    cardEnabled: true,
    subscriptionEnabled: true,
    dvaEnabled: true,
    refundsEnabled: true,
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    feeEfficiencyScore: 25, // Scores highest for primary fiat collections & payouts
    methods: ['card', 'bank_transfer', 'dva', 'subscription'],
    supportedFeatures: {
      checkout: true,
      cardPayments: true,
      bankTransfers: true,
      virtualAccounts: true,
      subscriptions: true,
      refunds: true,
      stablecoins: false,
      treasury: false
    }
  },

  grey: {
    name: 'grey',
    capabilityVersion: 1,
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    merchantCurrencies: ['USD', 'EUR', 'GBP'],
    nativeCurrencies: ['USD', 'EUR', 'GBP'],
    fallbackCurrencies: [],
    merchantEnabled: true,
    cardEnabled: false,
    subscriptionEnabled: false,
    dvaEnabled: true,
    refundsEnabled: false,
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ['USD', 'EUR', 'GBP'],
    feeEfficiencyScore: 12,
    methods: ['bank_transfer', 'dva'],
    supportedFeatures: {
      checkout: false,
      cardPayments: false,
      bankTransfers: true,
      virtualAccounts: true,
      subscriptions: false,
      refunds: false,
      stablecoins: false,
      treasury: false
    }
  },

  anchor: {
    name: 'anchor',
    capabilityVersion: 1,
    supportedCurrencies: ['NGN', 'USD'],
    merchantCurrencies: ['NGN', 'USD'],
    nativeCurrencies: ['NGN', 'USD'],
    fallbackCurrencies: [],
    merchantEnabled: true,
    cardEnabled: false,
    subscriptionEnabled: false,
    dvaEnabled: true,
    refundsEnabled: false,
    supportsInternational: true,
    requiresSmallestUnit: true,
    settlementCurrencies: ['NGN', 'USD'],
    feeEfficiencyScore: 20, // Scores high for treasury, stablecoins & USD BaaS
    methods: ['dva', 'bank_transfer', 'treasury'],
    supportedFeatures: {
      checkout: false,
      cardPayments: false,
      bankTransfers: true,
      virtualAccounts: true,
      subscriptions: false,
      refunds: false,
      stablecoins: true,
      treasury: true
    }
  },

  nowpayments: {
    name: 'nowpayments',
    capabilityVersion: 1,
    supportedCurrencies: ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP'],
    merchantCurrencies: ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP'],
    nativeCurrencies: ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP'],
    fallbackCurrencies: [],
    merchantEnabled: true,
    cardEnabled: false,
    subscriptionEnabled: false,
    dvaEnabled: false,
    refundsEnabled: false,
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ['USDT', 'USDC'],
    feeEfficiencyScore: 15,
    methods: ['crypto'],
    supportedFeatures: {
      checkout: true,
      cardPayments: false,
      bankTransfers: false,
      virtualAccounts: false,
      subscriptions: false,
      refunds: false,
      stablecoins: true,
      treasury: false
    }
  },
};

/**
 * Checks if a provider's merchant account natively supports a currency.
 * Uses merchantCurrencies (what we're enabled for), not just platform support.
 */
function supportsCurrency(providerName, currency) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p || !p.merchantEnabled) return false;
  return p.merchantCurrencies.includes(String(currency).toUpperCase());
}

/**
 * Checks if a provider supports a currency via SmartFallbackEngine.
 */
function supportsFallbackCurrency(providerName, currency) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p || !p.merchantEnabled) return false;
  return (p.fallbackCurrencies || []).includes(String(currency).toUpperCase());
}

/**
 * Checks if a provider supports a payment method.
 */
function supportsMethod(providerName, method = 'card') {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p || !p.merchantEnabled) return false;
  if (method === 'card') return p.cardEnabled;
  if (method === 'subscription') return p.subscriptionEnabled;
  if (method === 'bank_transfer' || method === 'dva') return p.dvaEnabled;
  if (method === 'crypto') return p.name === 'nowpayments';
  return p.methods.includes(method);
}

/**
 * Returns full capability record for a provider.
 */
function getProviderCapabilities(providerName) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p) throw new Error(`[ProviderRegistry] Unknown provider: ${providerName}`);
  return p;
}

/**
 * Returns all enabled providers that can process a given currency + method combination.
 */
function getCompatibleProviders(currency, method = 'card') {
  const up = String(currency).toUpperCase();
  return Object.values(PAYMENT_PROVIDER_CAPABILITIES).filter(
    (p) => p.merchantEnabled && (p.merchantCurrencies.includes(up) || (p.fallbackCurrencies || []).includes(up)) && p.methods.includes(method)
  );
}

module.exports = {
  PAYMENT_PROVIDER_CAPABILITIES,
  supportsCurrency,
  supportsFallbackCurrency,
  supportsMethod,
  getProviderCapabilities,
  getCompatibleProviders,
};
