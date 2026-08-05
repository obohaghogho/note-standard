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
// All Fincra-approved currencies have VA enabled via the Fincra merchant wallet.
// AUD, NZD, JPY remain coming_soon until provider approval.
const VA_FLAGS = {
  // Core fiat — always active via Fincra
  NGN: true,
  USD: true,
  EUR: true,
  GBP: true,
  CAD: true,
  // African fiat — active via Fincra
  GHS: true,
  KES: true,
  TZS: true,
  UGX: true,
  ZAR: true,
  XOF: true,
  MWK: true,
  RWF: true,
  XAF: true,
  ZMW: true,
  EGP: true,
  // Asian fiat — active via Fincra
  CNY: true,
  CNH: true,
  // Stablecoins — Fincra merchant wallet only (no virtual accounts)
  USDT: false,
  USDC: false,
  // Digital currency
  CNGN: false,
  // Coming soon — provider not yet approved for NoteStandard
  AUD: false,
  NZD: false,
  JPY: false,
};

// ── Virtual Account Provider Registry (Configuration-driven) ──────────────────
// All Fincra-approved currencies default to fincra for virtual accounts.
// AUD/NZD/JPY have no provider (not yet approved).
const VA_ROUTING = {
  NGN: process.env.NGN_VIRTUAL_ACCOUNT_PROVIDER || 'fincra',
  USD: process.env.USD_VIRTUAL_ACCOUNT_PROVIDER || 'grey',
  EUR: process.env.EUR_VIRTUAL_ACCOUNT_PROVIDER || 'grey',
  GBP: process.env.GBP_VIRTUAL_ACCOUNT_PROVIDER || 'grey',
  CAD: process.env.CAD_VIRTUAL_ACCOUNT_PROVIDER || 'fincra',
  GHS: 'fincra', TZS: 'fincra', KES: 'fincra', UGX: 'fincra',
  ZAR: 'fincra', XOF: 'fincra', MWK: 'fincra', RWF: 'fincra',
  XAF: 'fincra', ZMW: 'fincra', EGP: 'fincra', CNY: 'fincra',
  CNH: 'fincra',
};

// ── Provider Registry ─────────────────────────────────────────────────────────
// The canonical list of payment providers and their capabilities.
const PROVIDER_REGISTRY = {
  paystack: {
    name: 'Paystack',
    type: 'fiat_gateway',
    supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'JPY', 'ZAR', 'GHS', 'KES', 'EGP'],
    operations: ['deposit', 'withdraw', 'transfer', 'virtual_account'],
    requiresSmallestUnit: true,
    live: true,
  },
  paystack_international: {
    name: 'Paystack International',
    type: 'fiat_gateway',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'JPY'],
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
    name: 'Grey (Lead Bank)',
    type: 'fiat_gateway',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'NGN'],
    operations: ['deposit', 'withdraw', 'bank_transfer', 'virtual_account'],
    requiresSmallestUnit: false,
    live: true,
  },
  fincra: {
    name: 'Fincra',
    type: 'fiat_gateway',
    supportedCurrencies: [
      'NGN','USD','EUR','GBP','CAD',
      'GHS','KES','TZS','UGX','ZAR',
      'XOF','MWK','RWF','XAF','ZMW',
      'EGP','CNY','CNH','USDT','USDC',
      'CNGN',
    ],
    operations: ['deposit', 'withdraw', 'transfer', 'virtual_account', 'convert'],
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

// ── Currency sets ─────────────────────────────────────────────────────────────
// USDT/USDC appear in both sets because Fincra (fiat settlement) and
// NowPayments (on-chain) support them independently. The routing logic
// below separates them: Fincra USDT/USDC go through fiat path.
const CRYPTO_CURRENCIES = new Set(['BTC', 'ETH', 'MATIC', 'XRP', 'LTC', 'BNB']);
const FINCRA_FIAT_SET   = new Set([
  'NGN','USD','EUR','GBP','CAD',
  'GHS','KES','TZS','UGX','ZAR',
  'XOF','MWK','RWF','XAF','ZMW',
  'EGP','CNY','CNH','USDT','USDC','CNGN',
]);
const COMING_SOON_SET   = new Set(['AUD','NZD','JPY']);
const FIAT_CURRENCIES   = new Set([
  ...FINCRA_FIAT_SET, ...COMING_SOON_SET, 'AED',
]);

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
    if (!VA_FLAGS[code]) return 'coming_soon';
    return VA_ROUTING[code] || 'unsupported';
  }

  // ── Coming soon currencies (AUD, NZD, JPY) ───────────────────────────────
  if (COMING_SOON_SET.has(code)) return 'coming_soon';

  // ── Fincra fiat currencies (all 21 approved) ─────────────────────────────
  // USDT/USDC route through fincra (merchant wallet fiat settlement).
  // BTC/ETH are in CRYPTO_CURRENCIES above and will not reach here.
  if (FINCRA_FIAT_SET.has(code)) return 'fincra';

  // ── Other fiat (legacy / unlisted) ───────────────────────────────────────
  if (isFiat(code)) {
    if (PROVIDER_REGISTRY.fincra.supportedCurrencies.includes(code)) return 'fincra';
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
  const currencies = ['NGN', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'BTC', 'ETH', 'USDT', 'USDC'];
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
