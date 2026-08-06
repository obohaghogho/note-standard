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
  // ── Core Fiat ─────────────────────────────────────────────────────────────
  {
    code: 'NGN', type: 'fiat', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬',
    color: '#6366f1', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 100, minimum_withdrawal: 500,
    maximum_deposit: 5000000, maximum_withdrawal: 1000000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['card', 'bank_transfer', 'virtual_account'],
    display_order: 1,
  },
  {
    code: 'USD', type: 'fiat', name: 'US Dollar', symbol: '$', flag: '🇺🇸',
    color: '#10b981', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 1, minimum_withdrawal: 5,
    maximum_deposit: 50000, maximum_withdrawal: 10000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['card', 'ach_transfer', 'domestic_wire', 'international_wire', 'virtual_account'],
    display_order: 2,
  },
  {
    code: 'EUR', type: 'fiat', name: 'Euro', symbol: '€', flag: '🇪🇺',
    color: '#3b82f6', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 1, minimum_withdrawal: 5,
    maximum_deposit: 50000, maximum_withdrawal: 10000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['card', 'sepa_transfer', 'international_wire', 'virtual_account'],
    display_order: 3,
  },
  {
    code: 'GBP', type: 'fiat', name: 'British Pound', symbol: '£', flag: '🇬🇧',
    color: '#ec4899', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 1, minimum_withdrawal: 5,
    maximum_deposit: 50000, maximum_withdrawal: 10000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['card', 'faster_payments', 'chaps', 'bacs', 'virtual_account'],
    display_order: 4,
  },
  {
    code: 'CAD', type: 'fiat', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦',
    color: '#ff4d4d', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 1, minimum_withdrawal: 5,
    maximum_deposit: 50000, maximum_withdrawal: 10000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['card', 'eft_transfer', 'domestic_wire', 'virtual_account'],
    display_order: 5,
  },
  // ── African Fiat ──────────────────────────────────────────────────────────
  {
    code: 'GHS', type: 'fiat', name: 'Ghanaian Cedi', symbol: 'GH₵', flag: '🇬🇭',
    color: '#f59e0b', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 5, minimum_withdrawal: 10,
    maximum_deposit: 100000, maximum_withdrawal: 50000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'virtual_account'],
    display_order: 6,
  },
  {
    code: 'KES', type: 'fiat', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪',
    color: '#22c55e', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 100, minimum_withdrawal: 200,
    maximum_deposit: 5000000, maximum_withdrawal: 2000000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'mobile_money', 'virtual_account'],
    display_order: 7,
  },
  {
    code: 'TZS', type: 'fiat', name: 'Tanzanian Shilling', symbol: 'TSh', flag: '🇹🇿',
    color: '#14b8a6', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 1000, minimum_withdrawal: 2000,
    maximum_deposit: 10000000, maximum_withdrawal: 5000000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'mobile_money', 'virtual_account'],
    display_order: 8,
  },
  {
    code: 'UGX', type: 'fiat', name: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬',
    color: '#a855f7', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 1000, minimum_withdrawal: 2000,
    maximum_deposit: 10000000, maximum_withdrawal: 5000000,
    decimal_places: 0, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'mobile_money', 'virtual_account'],
    display_order: 9,
  },
  {
    code: 'ZAR', type: 'fiat', name: 'South African Rand', symbol: 'R', flag: '🇿🇦',
    color: '#0ea5e9', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 10, minimum_withdrawal: 20,
    maximum_deposit: 500000, maximum_withdrawal: 200000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['card', 'eft_transfer', 'virtual_account'],
    display_order: 10,
  },
  {
    code: 'XOF', type: 'fiat', name: 'West African CFA Franc', symbol: 'CFA', flag: '🌍',
    color: '#f97316', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 500, minimum_withdrawal: 1000,
    maximum_deposit: 5000000, maximum_withdrawal: 2000000,
    decimal_places: 0, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'mobile_money', 'virtual_account'],
    display_order: 11,
  },
  {
    code: 'MWK', type: 'fiat', name: 'Malawian Kwacha', symbol: 'MK', flag: '🇲🇼',
    color: '#84cc16', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 500, minimum_withdrawal: 1000,
    maximum_deposit: 2000000, maximum_withdrawal: 1000000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'virtual_account'],
    display_order: 12,
  },
  {
    code: 'RWF', type: 'fiat', name: 'Rwandan Franc', symbol: 'Fr', flag: '🇷🇼',
    color: '#06b6d4', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 500, minimum_withdrawal: 1000,
    maximum_deposit: 5000000, maximum_withdrawal: 2000000,
    decimal_places: 0, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'mobile_money', 'virtual_account'],
    display_order: 13,
  },
  {
    code: 'XAF', type: 'fiat', name: 'Central African CFA Franc', symbol: 'FCFA', flag: '🌍',
    color: '#8b5cf6', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 500, minimum_withdrawal: 1000,
    maximum_deposit: 5000000, maximum_withdrawal: 2000000,
    decimal_places: 0, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'mobile_money', 'virtual_account'],
    display_order: 14,
  },
  {
    code: 'ZMW', type: 'fiat', name: 'Zambian Kwacha', symbol: 'ZK', flag: '🇿🇲',
    color: '#d97706', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 10, minimum_withdrawal: 20,
    maximum_deposit: 500000, maximum_withdrawal: 200000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'virtual_account'],
    display_order: 15,
  },
  {
    code: 'EGP', type: 'fiat', name: 'Egyptian Pound', symbol: 'E£', flag: '🇪🇬',
    color: '#ef4444', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 10, minimum_withdrawal: 20,
    maximum_deposit: 500000, maximum_withdrawal: 200000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'virtual_account'],
    display_order: 16,
  },
  // ── Asian Fiat ────────────────────────────────────────────────────────────
  {
    code: 'CNY', type: 'fiat', name: 'Chinese Yuan (Onshore)', symbol: '¥', flag: '🇨🇳',
    color: '#dc2626', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 5, minimum_withdrawal: 10,
    maximum_deposit: 100000, maximum_withdrawal: 50000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'virtual_account'],
    display_order: 17,
  },
  {
    code: 'CNH', type: 'fiat', name: 'Chinese Yuan (Offshore)', symbol: 'CN¥', flag: '🇨🇳',
    color: '#b91c1c', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: false, convert_enabled: true,
    virtual_account_enabled: true,
    minimum_deposit: 5, minimum_withdrawal: 10,
    maximum_deposit: 100000, maximum_withdrawal: 50000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer', 'virtual_account'],
    display_order: 18,
  },
  // ── Stablecoins (Fincra Merchant Wallet Settlement) ───────────────────────
  // USDT/USDC on Fincra are fiat settlement instruments, not on-chain custody.
  // The NowPayments on-chain crypto path is separate and remains Coming Soon.
  {
    code: 'USDT', type: 'fiat', name: 'Tether (Fincra)', symbol: '₮', flag: '🟢',
    color: '#26a17b', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: true, convert_enabled: true,
    virtual_account_enabled: false,
    minimum_deposit: 15, minimum_withdrawal: 5,
    maximum_deposit: 100000, maximum_withdrawal: 50000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['international_wire'],
    display_order: 19,
  },
  {
    code: 'USDC', type: 'fiat', name: 'USD Coin (Fincra)', symbol: '●', flag: '🔵',
    color: '#2775ca', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: true, convert_enabled: true,
    virtual_account_enabled: false,
    minimum_deposit: 15, minimum_withdrawal: 5,
    maximum_deposit: 100000, maximum_withdrawal: 50000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['international_wire'],
    display_order: 20,
  },
  // ── Digital Currency ──────────────────────────────────────────────────────
  {
    code: 'CNGN', type: 'fiat', name: 'eNaira / CNGN', symbol: 'e₦', flag: '🇳🇬',
    color: '#7c3aed', status: 'active',
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, swap_enabled: true, convert_enabled: true,
    virtual_account_enabled: false,
    minimum_deposit: 100, minimum_withdrawal: 100,
    maximum_deposit: 1000000, maximum_withdrawal: 500000,
    decimal_places: 2, provider: 'fincra',
    deposit_methods: ['bank_transfer'],
    display_order: 21,
  },
  // ── Coming Soon ───────────────────────────────────────────────────────────
  // These currencies are approved by Fincra but not yet available on NoteStandard.
  // All capabilities are disabled. Displayed with a "Coming Soon" badge in the UI.
  {
    code: 'AUD', type: 'fiat', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺',
    color: '#f59e0b', status: 'coming_soon',
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, swap_enabled: false, convert_enabled: false,
    virtual_account_enabled: false,
    minimum_deposit: 0, minimum_withdrawal: 0,
    maximum_deposit: 0, maximum_withdrawal: 0,
    decimal_places: 2, provider: null,
    deposit_methods: [],
    display_order: 22,
    coming_soon_message: 'This currency will become available after provider approval.',
  },
  {
    code: 'NZD', type: 'fiat', name: 'New Zealand Dollar', symbol: 'NZ$', flag: '🇳🇿',
    color: '#00247d', status: 'coming_soon',
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, swap_enabled: false, convert_enabled: false,
    virtual_account_enabled: false,
    minimum_deposit: 0, minimum_withdrawal: 0,
    maximum_deposit: 0, maximum_withdrawal: 0,
    decimal_places: 2, provider: null,
    deposit_methods: [],
    display_order: 23,
    coming_soon_message: 'This currency will become available after provider approval.',
  },
  {
    code: 'JPY', type: 'fiat', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵',
    color: '#bc002d', status: 'coming_soon',
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, swap_enabled: false, convert_enabled: false,
    virtual_account_enabled: false,
    minimum_deposit: 0, minimum_withdrawal: 0,
    maximum_deposit: 0, maximum_withdrawal: 0,
    decimal_places: 0, provider: null,
    deposit_methods: [],
    display_order: 24,
    coming_soon_message: 'This currency will become available after provider approval.',
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
    minimum_deposit: 0.0001,
    minimum_withdrawal: 0.0005,
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
