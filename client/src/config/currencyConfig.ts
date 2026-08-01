export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  provider: string;
  features: string[];
  notice?: string;
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  transfer_enabled: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  convert_enabled: boolean;
  settlement_aware?: boolean;
  capabilities?: {
    deposit: boolean;
    withdrawal: boolean;
    virtualAccount: boolean;
    conversion: boolean;
    settlementAware: boolean;
  };
  decimal_places: number;
  tooltip?: string;
}

export interface CryptoCurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  custodyStatus: 'coming_soon' | 'active';
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

// ── FIAT CURRENCY CATALOG (Configuration-driven) ─────────────────────────────
// To unlock any currency in the future: change status from 'coming_soon' → 'active'
// and set deposit_enabled/withdraw_enabled to true. Zero code changes needed elsewhere.
// SUPPORTED_CURRENCIES and COMING_SOON_CURRENCIES are derived from this config.
export const FIAT_CURRENCY_CATALOG: CurrencyConfig[] = [
  // =========================================================================
  // ACTIVE FIAT CURRENCIES — Full Fincra Merchant Wallet support
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
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Collections', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', color: '#8b5cf6',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Collections', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧', color: '#ec4899',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Collections', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', color: '#ff4d4d',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Collections', 'FX Conversion', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', flag: '🇬🇭', color: '#006b3f',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪', color: '#990000',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', flag: '🇹🇿', color: '#1ebf53',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬', color: '#fcdc04',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 0,
  },
  {
    code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦', color: '#007749',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'EFT Transfer', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', flag: '🌍', color: '#008559',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 0,
  },
  {
    code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', flag: '🇲🇼', color: '#ea2328',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', flag: '🇷🇼', color: '#00a3e0',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 0,
  },
  {
    code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', flag: '🌍', color: '#005b82',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Mobile Money', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 0,
  },
  {
    code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', flag: '🇿🇲', color: '#198a00',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', flag: '🇪🇬', color: '#c09300',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'CNY', name: 'Chinese Yuan (Onshore)', symbol: '¥', flag: '🇨🇳', color: '#de2910',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  {
    code: 'CNH', name: 'Chinese Yuan (Offshore)', symbol: 'CN¥', flag: '🇨🇳', color: '#ff4e00',
    status: 'active', provider: 'Licensed Banking Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer', 'Virtual Account'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: true, sell_enabled: true, convert_enabled: true, decimal_places: 2,
  },
  // Stablecoins — Merchant wallet settlement (separate from NowPayments on-chain)
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
  // Digital currency
  {
    code: 'CNGN', name: 'eNaira / CNGN', symbol: 'e₦', flag: '🇳🇬', color: '#7c3aed',
    status: 'active', provider: 'Licensed Settlement Partner',
    features: ['Balance', 'Deposits', 'Withdrawals', 'Bank Transfer'],
    deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true,
    buy_enabled: false, sell_enabled: false, convert_enabled: true, decimal_places: 2,
  },
  // =========================================================================
  // COMING SOON — Not yet available. All actions disabled.
  // Only AUD, NZD, and JPY remain here. Banking partner approval pending.
  // =========================================================================
  {
    code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', color: '#f59e0b',
    status: 'coming_soon', provider: 'Pending Banking Partner Approval',
    features: [],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'This currency will become available after banking partner approval.',
  },
  {
    code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', flag: '🇳🇿', color: '#00247d',
    status: 'coming_soon', provider: 'Pending Banking Partner Approval',
    features: [],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2,
    tooltip: 'This currency will become available after banking partner approval.',
  },
  {
    code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵', color: '#bc002d',
    status: 'coming_soon', provider: 'Pending Banking Partner Approval',
    features: [],
    deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false,
    buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 0,
    tooltip: 'This currency will become available after banking partner approval.',
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
// Only true blockchain cryptocurrencies belong here.
// Stablecoins (USDT, USDC, CNGN) settled via Fincra belong in FIAT_CURRENCY_CATALOG.
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

// Helper functions for easy filtering
export const getActiveFiatCurrencies = (): CurrencyConfig[] => {
  return FIAT_CURRENCY_CATALOG.filter(c => c.status === 'active');
};

export const getComingSoonFiatCurrencies = (): CurrencyConfig[] => {
  return FIAT_CURRENCY_CATALOG.filter(c => c.status === 'coming_soon');
};
