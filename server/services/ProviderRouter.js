/**
 * ProviderRouter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes payment operations to the correct provider, decoupling the rest of
 * the application from knowing which PSP handles which currency.
 *
 * Provider Priority (per operation):
 *   NGN fiat ops          → paystack
 *   USD/EUR/GBP fiat ops  → paystack_international (if enabled) or coming_soon
 *   Crypto ops            → nowpayments
 *   Crypto ↔ Crypto swap  → internal (SwapService)
 *   Fiat ↔ Fiat convert   → internal (SwapService + FxService)
 *   USD/EUR/GBP bank tx   → grey  (future)
 *
 * Adding a new provider:
 *   1. Add it to PROVIDER_REGISTRY below.
 *   2. Add routing rules to OPERATION_ROUTING.
 *   3. No changes needed elsewhere in the codebase.
 */

'use strict';

const INTL_ENABLED = process.env.INTERNATIONAL_FIAT_ENABLED === 'true';

// ── Feature Flags for Virtual Accounts ───────────────────────────────────────
const VA_FLAGS = {
  NGN: true, // NGN is always active natively
  USD: process.env.USD_VIRTUAL_ACCOUNTS_ENABLED === 'true',
  EUR: process.env.EUR_VIRTUAL_ACCOUNTS_ENABLED === 'true',
  GBP: process.env.GBP_VIRTUAL_ACCOUNTS_ENABLED === 'true',
  CAD: process.env.CAD_VIRTUAL_ACCOUNTS_ENABLED === 'true',
  AUD: process.env.AUD_VIRTUAL_ACCOUNTS_ENABLED === 'true',
};

// ── Virtual Account Provider Registry (Configuration-driven) ──────────────────
const VA_ROUTING = {
  NGN: process.env.NGN_VIRTUAL_ACCOUNT_PROVIDER || 'paystack',
  USD: process.env.USD_VIRTUAL_ACCOUNT_PROVIDER || 'fincra',
  EUR: process.env.EUR_VIRTUAL_ACCOUNT_PROVIDER || 'fincra',
  GBP: process.env.GBP_VIRTUAL_ACCOUNT_PROVIDER || 'fincra',
  CAD: process.env.CAD_VIRTUAL_ACCOUNT_PROVIDER || 'fincra',
  AUD: process.env.AUD_VIRTUAL_ACCOUNT_PROVIDER || 'fincra',
};

// ── Provider Registry ─────────────────────────────────────────────────────────
// The canonical list of payment providers and their capabilities.
const PROVIDER_REGISTRY = {
  paystack: {
    name: 'Paystack',
    type: 'fiat_gateway',
    supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'GHS', 'KES', 'EGP'],
    operations: ['deposit', 'withdraw', 'transfer', 'virtual_account'],
    requiresSmallestUnit: true,
    live: true,
  },
  paystack_international: {
    name: 'Paystack International',
    type: 'fiat_gateway',
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    operations: ['deposit', 'withdraw'],
    requiresSmallestUnit: true,
    live: INTL_ENABLED,
  },
  nowpayments: {
    name: 'NOWPayments',
    type: 'crypto_gateway',
    supportedCurrencies: ['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP', 'LTC', 'BNB'],
    operations: ['deposit', 'withdraw', 'buy', 'sell'],
    requiresSmallestUnit: false,
    live: true,
  },
  grey: {
    name: 'Grey',
    type: 'fiat_gateway',
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    operations: ['deposit', 'withdraw', 'bank_transfer', 'virtual_account'],
    requiresSmallestUnit: false,
    live: false, // not yet integrated
  },
  fincra: {
    name: 'Fincra',
    type: 'fiat_gateway',
    supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'KES'],
    operations: ['deposit', 'withdraw', 'transfer', 'virtual_account'],
    requiresSmallestUnit: false,
    live: true,
  },
  internal: {
    name: 'Internal Ledger',
    type: 'internal',
    supportedCurrencies: ['*'],
    operations: ['swap', 'convert', 'internal_transfer'],
    requiresSmallestUnit: false,
    live: true,
  },
};

// ── Crypto currency set ───────────────────────────────────────────────────────
const CRYPTO_CURRENCIES = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'XRP', 'LTC', 'BNB']);
const FIAT_CURRENCIES   = new Set(['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'ZAR', 'KES', 'EGP', 'CAD', 'AUD', 'JPY', 'AED']);

/**
 * Determines whether a currency code is crypto.
 * @param {string} code
 * @returns {boolean}
 */
function isCrypto(code) {
  return CRYPTO_CURRENCIES.has((code || '').toUpperCase());
}

/**
 * Determines whether a currency code is fiat.
 * @param {string} code
 * @returns {boolean}
 */
function isFiat(code) {
  return FIAT_CURRENCIES.has((code || '').toUpperCase());
}

/**
 * Returns the provider name for a given (currency, operation) combination.
 *
 * @param {string} currency   - e.g. 'NGN', 'BTC', 'USD'
 * @param {string} operation  - 'deposit' | 'withdraw' | 'transfer' | 'buy' | 'sell' | 'swap' | 'convert' | 'virtual_account'
 * @returns {string} provider name
 */
function getProvider(currency, operation) {
  const code = (currency || '').toUpperCase();
  const op   = (operation || '').toLowerCase();

  // ── Internal operations ───────────────────────────────────────────────────
  if (op === 'swap' || op === 'convert' || op === 'internal_transfer') {
    return 'internal';
  }

  // ── Crypto currencies ─────────────────────────────────────────────────────
  if (isCrypto(code)) {
    // Crypto swaps go through internal ledger
    if (op === 'swap') return 'internal';
    // All other crypto ops go through NOWPayments
    const np = PROVIDER_REGISTRY.nowpayments;
    if (np.supportedCurrencies.includes(code) && np.operations.includes(op)) {
      return 'nowpayments';
    }
    return 'unsupported';
  }

  // ── Virtual Account Operation ─────────────────────────────────────────────
  if (op === 'virtual_account') {
    // Check if the specific currency virtual account is enabled (feature flag + global intl switch)
    const isNg = code === 'NGN';
    const isIntlVAEnabled = VA_FLAGS[code] && INTL_ENABLED;
    
    if (!isNg && !isIntlVAEnabled) {
      return 'coming_soon';
    }
    
    return VA_ROUTING[code] || 'unsupported';
  }

  // ── NGN (primary fiat) ────────────────────────────────────────────────────
  if (code === 'NGN') {
    return 'paystack';
  }

  // ── International fiat currencies ─────────────────────────────────────────
  if (['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(code)) {
    if (!INTL_ENABLED) return 'coming_soon';
    // Bank transfers for international fiat use Grey (future)
    if (op === 'bank_transfer') return PROVIDER_REGISTRY.grey.live ? 'grey' : 'coming_soon';
    return 'fincra'; // Use Fincra for cross-border checkouts
  }

  // ── Other fiat (GHS, ZAR, KES, etc.) ────────────────────────────────────
  if (isFiat(code)) {
    if (PROVIDER_REGISTRY.paystack.supportedCurrencies.includes(code)) return 'paystack';
    return 'coming_soon';
  }

  return 'unsupported';
}

/**
 * Checks if a (currency, operation) combination is currently available.
 *
 * @param {string} currency
 * @param {string} operation
 * @returns {boolean}
 */
function isOperationAvailable(currency, operation) {
  const provider = getProvider(currency, operation);
  return provider !== 'coming_soon' && provider !== 'unsupported';
}

/**
 * Returns the full capabilities of a specific provider.
 *
 * @param {string} providerName
 * @returns {object|null}
 */
function getProviderInfo(providerName) {
  return PROVIDER_REGISTRY[providerName] || null;
}

/**
 * Returns the full provider routing table for admin display.
 * Shows which provider handles each currency × operation.
 *
 * @returns {object} routing table
 */
function getRoutingTable() {
  const currencies = ['NGN', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BTC', 'ETH', 'USDT', 'USDC'];
  const operations = ['deposit', 'withdraw', 'transfer', 'buy', 'sell', 'swap', 'convert', 'virtual_account'];
  const table = {};
  for (const currency of currencies) {
    table[currency] = {};
    for (const op of operations) {
      table[currency][op] = getProvider(currency, op);
    }
  }
  return table;
}

/**
 * Returns all providers that are currently live (integrated and active).
 * @returns {string[]}
 */
function getLiveProviders() {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([, info]) => info.live)
    .map(([name]) => name);
}

module.exports = {
  PROVIDER_REGISTRY,
  getProvider,
  isOperationAvailable,
  getProviderInfo,
  getRoutingTable,
  getLiveProviders,
  isCrypto,
  isFiat,
};
