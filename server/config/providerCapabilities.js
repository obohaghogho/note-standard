/**
 * providerCapabilities.js
 * =======================
 * Registry: what each gateway supports & merchant-level feature flags.
 * Multi-Currency Payment Engine v4 — NoteStandard Global Financial Platform
 *
 * Phase 17: Added maintenanceMode field to all providers.
 * Values: 'ACTIVE' | 'MAINTENANCE' | 'READ_ONLY' | 'DRAIN_ONLY'
 *   ACTIVE      — Normal routing (default)
 *   MAINTENANCE — Excluded from all routing
 *   READ_ONLY   — Health checks only, no transactions
 *   DRAIN_ONLY  — No new transactions, existing completions continue
 *
 * Maintenance mode can also be overridden per-provider via DB (banking_providers.maintenance_mode).
 */

const PAYMENT_PROVIDER_CAPABILITIES = {
  paystack: {
    name: 'paystack',
    capabilityVersion: 1,
    maintenanceMode: 'ACTIVE',
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
    maintenanceMode: 'ACTIVE',
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
    feeEfficiencyScore: 25,
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
    maintenanceMode: 'ACTIVE',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'NGN'],
    merchantCurrencies: ['USD', 'EUR', 'GBP', 'NGN'],
    nativeCurrencies: ['USD', 'EUR', 'GBP', 'NGN'],
    fallbackCurrencies: [],
    merchantEnabled: true,
    cardEnabled: false,
    subscriptionEnabled: false,
    dvaEnabled: true,
    refundsEnabled: false,
    supportsInternational: true,
    requiresSmallestUnit: false,
    settlementCurrencies: ['USD', 'EUR', 'GBP', 'NGN'],
    feeEfficiencyScore: 50,
    methods: ['bank_transfer', 'dva'],
    supportedFeatures: {
      checkout: true,
      cardPayments: false,
      bankTransfers: true,
      virtualAccounts: true,
      subscriptions: false,
      refunds: false,
      stablecoins: false,
      treasury: true
    }
  },

  anchor: {
    name: 'anchor',
    capabilityVersion: 1,
    maintenanceMode: 'ACTIVE',
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
    feeEfficiencyScore: 20,
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
    maintenanceMode: 'ACTIVE',
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
 */
function supportsCurrency(providerName, currency) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p || !p.merchantEnabled) return false;
  return p.merchantCurrencies.includes(String(currency).toUpperCase());
}

function supportsFallbackCurrency(providerName, currency) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p || !p.merchantEnabled) return false;
  return (p.fallbackCurrencies || []).includes(String(currency).toUpperCase());
}

function supportsMethod(providerName, method = 'card') {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p || !p.merchantEnabled) return false;
  if (method === 'card') return p.cardEnabled;
  if (method === 'subscription') return p.subscriptionEnabled;
  if (method === 'bank_transfer' || method === 'dva') return p.dvaEnabled;
  if (method === 'crypto') return p.name === 'nowpayments';
  return p.methods.includes(method);
}

function getProviderCapabilities(providerName) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p) throw new Error(`[ProviderRegistry] Unknown provider: ${providerName}`);
  return p;
}

function getCompatibleProviders(currency, method = 'card') {
  const up = String(currency).toUpperCase();
  return Object.values(PAYMENT_PROVIDER_CAPABILITIES).filter(
    (p) => p.merchantEnabled && (p.merchantCurrencies.includes(up) || (p.fallbackCurrencies || []).includes(up)) && p.methods.includes(method)
  );
}

/**
 * [Phase 17] Check if a provider is in a non-ACTIVE maintenance state.
 * @param {string} providerName
 * @param {boolean} [blockDrainOnly=true]  If true, DRAIN_ONLY is also blocked for new transactions
 * @returns {boolean} true = blocked from routing
 */
function isInMaintenance(providerName, blockDrainOnly = true) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p) return false;
  const mode = p.maintenanceMode || 'ACTIVE';
  if (mode === 'MAINTENANCE' || mode === 'READ_ONLY') return true;
  if (blockDrainOnly && mode === 'DRAIN_ONLY') return true;
  return false;
}

/**
 * [Phase 17] Get the maintenance mode for a provider.
 */
function getMaintenanceMode(providerName) {
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  return p?.maintenanceMode || 'ACTIVE';
}

/**
 * [Phase 17] Set maintenance mode at runtime (does NOT persist to DB).
 * For DB-backed persistence, update banking_providers.maintenance_mode.
 */
function setMaintenanceMode(providerName, mode) {
  const VALID_MODES = ['ACTIVE', 'MAINTENANCE', 'READ_ONLY', 'DRAIN_ONLY'];
  if (!VALID_MODES.includes(mode)) throw new Error(`Invalid maintenance mode: ${mode}`);
  const p = PAYMENT_PROVIDER_CAPABILITIES[String(providerName).toLowerCase()];
  if (!p) throw new Error(`Unknown provider: ${providerName}`);
  p.maintenanceMode = mode;
}

module.exports = {
  PAYMENT_PROVIDER_CAPABILITIES,
  supportsCurrency,
  supportsFallbackCurrency,
  supportsMethod,
  getProviderCapabilities,
  getCompatibleProviders,
  isInMaintenance,
  getMaintenanceMode,
  setMaintenanceMode,
};
