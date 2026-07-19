/**
 * walletCurrencyCatalog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wallet Hub currency catalog — the full capability matrix for every supported
 * currency in the NoteStandard Wallet Hub.
 *
 * Priority order (DB-first architecture):
 *   1. `supported_currencies` Supabase table  ← admin-controlled, hot-reloadable
 *   2. INTERNATIONAL_FIAT_ENABLED env var      ← quick unlock without DB
 *   3. This file                               ← safe hardcoded defaults
 *
 * Adding a new currency in production:
 *   → Insert a row into `supported_currencies` via the Admin Currency panel.
 *   → No code changes or deploys needed.
 *
 * NOTE: This is a NEW file separate from the existing currencyConfig.js.
 *       currencyConfig.js handles routing/gateway logic; this file handles
 *       UI capability flags and metadata for the Wallet Hub display layer.
 */

'use strict';

const INTL = process.env.INTERNATIONAL_FIAT_ENABLED === 'true';

const FIAT_CATALOG = [
  {
    code: 'NGN',
    type: 'fiat',
    name: 'Nigerian Naira',
    symbol: '₦',
    flag: '🇳🇬',
    color: '#6366f1',
    status: 'active',
    deposit_enabled: true,
    withdraw_enabled: true,
    transfer_enabled: true,
    buy_enabled: true,
    sell_enabled: true,
    swap_enabled: false,
    convert_enabled: false,
    minimum_deposit: 100,
    minimum_withdrawal: 500,
    maximum_deposit: 5000000,
    maximum_withdrawal: 1000000,
    decimal_places: 2,
    provider: 'paystack',
    deposit_methods: ['card', 'bank_transfer'],
    display_order: 1,
  },
  {
    code: 'USD',
    type: 'fiat',
    name: 'US Dollar',
    symbol: '$',
    flag: '🇺🇸',
    color: '#10b981',
    status: INTL ? 'active' : 'coming_soon',
    deposit_enabled: INTL,
    withdraw_enabled: INTL,
    transfer_enabled: INTL,
    buy_enabled: INTL,
    sell_enabled: INTL,
    swap_enabled: false,
    convert_enabled: INTL,
    minimum_deposit: 1,
    minimum_withdrawal: 5,
    maximum_deposit: 50000,
    maximum_withdrawal: 10000,
    decimal_places: 2,
    provider: 'paystack_international',
    deposit_methods: ['card', 'apple_pay', 'google_pay'],
    display_order: 2,
  },
  {
    code: 'EUR',
    type: 'fiat',
    name: 'Euro',
    symbol: '€',
    flag: '🇪🇺',
    color: '#3b82f6',
    status: INTL ? 'active' : 'coming_soon',
    deposit_enabled: INTL,
    withdraw_enabled: INTL,
    transfer_enabled: INTL,
    buy_enabled: INTL,
    sell_enabled: INTL,
    swap_enabled: false,
    convert_enabled: INTL,
    minimum_deposit: 1,
    minimum_withdrawal: 5,
    maximum_deposit: 50000,
    maximum_withdrawal: 10000,
    decimal_places: 2,
    provider: 'paystack_international',
    deposit_methods: ['card', 'bank_transfer'],
    display_order: 3,
  },
  {
    code: 'GBP',
    type: 'fiat',
    name: 'British Pound',
    symbol: '£',
    flag: '🇬🇧',
    color: '#ec4899',
    status: INTL ? 'active' : 'coming_soon',
    deposit_enabled: INTL,
    withdraw_enabled: INTL,
    transfer_enabled: INTL,
    buy_enabled: INTL,
    sell_enabled: INTL,
    swap_enabled: false,
    convert_enabled: INTL,
    minimum_deposit: 1,
    minimum_withdrawal: 5,
    maximum_deposit: 50000,
    maximum_withdrawal: 10000,
    decimal_places: 2,
    provider: 'paystack_international',
    deposit_methods: ['card', 'bank_transfer'],
    display_order: 4,
  },
];

const CRYPTO_CATALOG = [
  {
    code: 'BTC',
    type: 'crypto',
    name: 'Bitcoin',
    symbol: '₿',
    flag: '🟠',
    color: '#f59e0b',
    status: 'active',
    deposit_enabled: true,
    withdraw_enabled: true,
    transfer_enabled: false,
    buy_enabled: true,
    sell_enabled: true,
    swap_enabled: true,
    convert_enabled: false,
    minimum_deposit: 0.00001,
    minimum_withdrawal: 0.0001,
    maximum_deposit: 10,
    maximum_withdrawal: 5,
    decimal_places: 8,
    provider: 'nowpayments',
    networks: ['bitcoin', 'BEP20'],
    display_order: 1,
  },
  {
    code: 'ETH',
    type: 'crypto',
    name: 'Ethereum',
    symbol: 'Ξ',
    flag: '🔷',
    color: '#8b5cf6',
    status: 'active',
    deposit_enabled: true,
    withdraw_enabled: true,
    transfer_enabled: false,
    buy_enabled: true,
    sell_enabled: true,
    swap_enabled: true,
    convert_enabled: false,
    minimum_deposit: 0.001,
    minimum_withdrawal: 0.005,
    maximum_deposit: 100,
    maximum_withdrawal: 50,
    decimal_places: 6,
    provider: 'nowpayments',
    networks: ['ERC20', 'BEP20'],
    display_order: 2,
  },
  {
    code: 'USDT',
    type: 'crypto',
    name: 'Tether',
    symbol: '₮',
    flag: '🟢',
    color: '#26a17b',
    status: 'active',
    deposit_enabled: true,
    withdraw_enabled: true,
    transfer_enabled: false,
    buy_enabled: true,
    sell_enabled: true,
    swap_enabled: true,
    convert_enabled: false,
    minimum_deposit: 1,
    minimum_withdrawal: 5,
    maximum_deposit: 100000,
    maximum_withdrawal: 50000,
    decimal_places: 2,
    provider: 'nowpayments',
    networks: ['TRC20', 'ERC20', 'BEP20'],
    display_order: 3,
  },
  {
    code: 'USDC',
    type: 'crypto',
    name: 'USD Coin',
    symbol: '●',
    flag: '🔵',
    color: '#2775ca',
    status: 'active',
    deposit_enabled: true,
    withdraw_enabled: true,
    transfer_enabled: false,
    buy_enabled: true,
    sell_enabled: true,
    swap_enabled: true,
    convert_enabled: false,
    minimum_deposit: 1,
    minimum_withdrawal: 5,
    maximum_deposit: 100000,
    maximum_withdrawal: 50000,
    decimal_places: 2,
    provider: 'nowpayments',
    networks: ['ERC20', 'BEP20', 'polygon'],
    display_order: 4,
  },
];

/**
 * Returns the combined fiat + crypto catalog, sorted by type then display_order.
 */
function getAllCurrencies() {
  return [...FIAT_CATALOG, ...CRYPTO_CATALOG].sort((a, b) => a.display_order - b.display_order);
}

/**
 * Returns a single currency entry by code (case-insensitive).
 * @param {string} code
 */
function getCatalogEntry(code) {
  const upper = (code || '').toUpperCase();
  return [...FIAT_CATALOG, ...CRYPTO_CATALOG].find(c => c.code === upper) || null;
}

/**
 * Checks whether a specific capability is enabled for a currency in the static catalog.
 * The DB-sourced version takes priority in the controller.
 * @param {string} code
 * @param {string} capability - e.g. 'deposit_enabled', 'buy_enabled'
 */
function catalogSupports(code, capability) {
  const entry = getCatalogEntry(code);
  if (!entry) return false;
  if (entry.status !== 'active') return false;
  return !!entry[capability];
}

module.exports = {
  FIAT_CATALOG,
  CRYPTO_CATALOG,
  getAllCurrencies,
  getCatalogEntry,
  catalogSupports,
};
