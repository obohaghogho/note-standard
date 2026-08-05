/**
 * client/src/config/currencyConfig.ts
 * =====================================
 * Single Source of Truth for Client Currency Configurations.
 * Environment-Aware & Production Feature Flag Protected.
 *
 * In Production: Only fully functional currencies (NGN & USD) are active.
 * In Development (localhost): Developers can test all currencies (EUR, GBP, CAD, AUD, ZAR, GHS, etc.).
 */

import { CurrencyFeatureService } from '../../../shared/services/CurrencyFeatureService';

export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  provider: string;
  features: string[];
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  transfer_enabled: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  convert_enabled: boolean;
  decimal_places: number;
  tooltip?: string;
  notice?: string;
}

export interface CryptoCurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  custodyStatus: 'live' | 'coming_soon';
  custodyBadgeText: string;
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  swap_enabled: boolean;
  decimal_places: number;
  networks: string[];
  tooltip?: string;
}

export const FIAT_CURRENCY_CATALOG: CurrencyConfig[] = [
  // =========================================================================
  // PRODUCTION LIVE FIAT CURRENCIES — Fully operational multi-rail banking
  // =========================================================================
  {
    code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬', color: '#10b981',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Deposit', 'Withdrawal', 'Bank Transfer', 'Virtual Account', 'Balance', 'Transaction History'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸', color: '#3b82f6',
    status: 'active', provider: 'Lead Bank (USD Account)',
    features: ['Balance', 'Deposits', 'Withdrawals', 'ACH & Wire', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },

  // =========================================================================
  // DEVELOPMENT & STAGED FIAT CURRENCIES — Accessible on localhost for testing
  // =========================================================================
  {
    code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', color: '#8b5cf6',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Collections', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'Euro virtual account integration is currently in development.',
  },
  {
    code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧', color: '#ec4899',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Collections', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'British Pound account integration is currently in development.',
  },
  {
    code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', color: '#ff4d4d',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Collections', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'Canadian Dollar account integration is currently in development.',
  },
  {
    code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', flag: '🇬🇭', color: '#006b3f',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'Ghanaian Cedi Mobile Money integration is currently in development.',
  },
  {
    code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪', color: '#990000',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'Kenyan Shilling integration is currently in development.',
  },
  {
    code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', flag: '🇹🇿', color: '#1ebf53',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
  },
  {
    code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬', color: '#fcdc04',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 0,
  },
  {
    code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦', color: '#007749',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'EFT Transfer', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'South African Rand integration is currently in development.',
  },
  {
    code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', flag: '🌍', color: '#008559',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 0,
  },
  {
    code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', flag: '🇲🇼', color: '#ea2328',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
  },
  {
    code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', flag: '🇷🇼', color: '#00a3e0',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 0,
  },
  {
    code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', flag: '🌍', color: '#005b82',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 0,
  },
  {
    code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', flag: '🇿🇲', color: '#198a00',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
  },
  {
    code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', flag: '🇪🇬', color: '#c09300',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
  },
  {
    code: 'CNY', name: 'Chinese Yuan (Onshore)', symbol: '¥', flag: '🇨🇳', color: '#de2910',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
  },
  {
    code: 'CNH', name: 'Chinese Yuan (Offshore)', symbol: 'CN¥', flag: '🇨🇳', color: '#ff4e00',
    status: 'coming_soon', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
  },

  // =========================================================================
  // SETTLEMENT STABLECOINS — Internal multi-currency bridge
  // =========================================================================
  {
    code: 'USDT', name: 'Tether', symbol: '₮', flag: '🟢', color: '#26a17b',
    status: 'active', provider: 'Licensed Settlement Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'FX Conversion'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: false, sell_enabled: false, convert_enabled: true, decimal_places: 2,
    notice: 'Settlement stablecoin — separate from on-chain crypto custody.',
  },
  {
    code: 'USDC', name: 'USD Coin', symbol: '●', flag: '🔵', color: '#2775ca',
    status: 'active', provider: 'Licensed Settlement Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'FX Conversion'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: false, sell_enabled: false, convert_enabled: true, decimal_places: 2,
    notice: 'Settlement stablecoin — separate from on-chain crypto custody.',
  },
];

// Exported sets for type-safe feature-flag checks
export const SUPPORTED_CURRENCIES = new Set(
  FIAT_CURRENCY_CATALOG.filter(c => c.status === 'active').map(c => c.code)
);
export const COMING_SOON_CURRENCIES = new Set(
  FIAT_CURRENCY_CATALOG.filter(c => c.status === 'coming_soon').map(c => c.code)
);

// ── CRYPTO CURRENCY CATALOG (On-Chain Custody via NOWPayments) ───────────────
export const CRYPTO_CURRENCY_CATALOG: CryptoCurrencyConfig[] = [
  {
    code: 'BTC',
    name: 'Bitcoin',
    symbol: '₿',
    flag: '🟠',
    color: '#f59e0b',
    status: 'coming_soon',
    custodyStatus: 'coming_soon',
    custodyBadgeText: 'NOWPayments On-Chain Custody',
    deposit_enabled: false,
    withdraw_enabled: false,
    buy_enabled: false,
    sell_enabled: false,
    swap_enabled: false,
    decimal_places: 8,
    networks: ['bitcoin', 'BEP20'],
    tooltip: 'NOWPayments on-chain custody integration coming soon.',
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    symbol: 'Ξ',
    flag: '🔷',
    color: '#8b5cf6',
    status: 'coming_soon',
    custodyStatus: 'coming_soon',
    custodyBadgeText: 'NOWPayments On-Chain Custody',
    deposit_enabled: false,
    withdraw_enabled: false,
    buy_enabled: false,
    sell_enabled: false,
    swap_enabled: false,
    decimal_places: 6,
    networks: ['ERC20', 'BEP20'],
    tooltip: 'NOWPayments on-chain custody integration coming soon.',
  },
];

// Environment-Aware Helper Functions
export const getActiveFiatCurrencies = (): CurrencyConfig[] => {
  const visible = CurrencyFeatureService.getVisibleCurrencies();
  return FIAT_CURRENCY_CATALOG.filter(c => c.status === 'active' && visible.includes(c.code));
};

export const getComingSoonFiatCurrencies = (): CurrencyConfig[] => {
  const visible = CurrencyFeatureService.getVisibleCurrencies();
  return FIAT_CURRENCY_CATALOG.filter(c => c.status === 'coming_soon' && visible.includes(c.code));
};
