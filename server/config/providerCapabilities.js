/**
 * providerCapabilities.js
 * =======================
 * Registry: what each gateway supports & merchant-level feature flags.
 * Multi-Currency Payment Engine v4 — NoteStandard Global Financial Platform
 */

const PAYMENT_PROVIDER_CAPABILITIES = {
  paystack: {
    name: 'paystack',
    // Currencies the gateway platform accepts natively
    supportedCurrencies: ['NGN', 'USD', 'ZAR', 'GHS', 'KES', 'EGP'],
    // Currencies our merchant account is enabled for
    merchantCurrencies: ['NGN', 'USD'],
    // Feature flags — controlled by config, not code
    merchantEnabled: true,
    cardEnabled: true,
    subscriptionEnabled: true,
    dvaEnabled: true,        // Dynamic Virtual Account
    refundsEnabled: true,
    supportsInternational: true,
    requiresSmallestUnit: true, // Amount must be in kobo/cents
    // The currencies we actually receive settlement in
    settlementCurrencies: ['NGN', 'USD'],
    // Lower = cheaper; used in scoring
    feeEfficiencyScore: 10,
    // Supported payment methods
    methods: ['card', 'bank_transfer', 'dva', 'subscription'],
  },

  fincra: {
    name: 'fincra',
    supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    merchantCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    merchantEnabled: true,
    cardEnabled: true,
    subscriptionEnabled: true,
    dvaEnabled: true,
    refundsEnabled: true,
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    feeEfficiencyScore: 9,
    methods: ['card', 'bank_transfer', 'dva', 'subscription'],
  },

  grey: {
    name: 'grey',
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    merchantCurrencies: ['USD', 'EUR', 'GBP'],
    merchantEnabled: true,
    cardEnabled: false,
    subscriptionEnabled: false,
    dvaEnabled: true,
    refundsEnabled: false,
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ['USD', 'EUR', 'GBP'],
    feeEfficiencyScore: 8,
    methods: ['bank_transfer', 'dva'],
  },

  anchor: {
    name: 'anchor',
    supportedCurrencies: ['NGN', 'USD'],
    merchantCurrencies: ['NGN', 'USD'],
    merchantEnabled: true,
    cardEnabled: false,
    subscriptionEnabled: false,
    dvaEnabled: true,
    refundsEnabled: false,
    supportsInternational: true,
    requiresSmallestUnit: true, // Kobo for NGN, cents for USD
    settlementCurrencies: ['NGN', 'USD'],
    feeEfficiencyScore: 8,
    methods: ['dva', 'bank_transfer'],
  },

  nowpayments: {
    name: 'nowpayments',
    supportedCurrencies: ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP'],
    merchantCurrencies: ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP'],
    merchantEnabled: true,
    cardEnabled: false,
    subscriptionEnabled: false,
    dvaEnabled: false,
    refundsEnabled: false,
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ['USDT', 'USDC'],
    feeEfficiencyScore: 7,
    methods: ['crypto'],
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
    (p) => p.merchantEnabled && p.merchantCurrencies.includes(up) && p.methods.includes(method)
  );
}

module.exports = {
  PAYMENT_PROVIDER_CAPABILITIES,
  supportsCurrency,
  supportsMethod,
  getProviderCapabilities,
  getCompatibleProviders,
};
