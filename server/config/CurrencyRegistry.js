'use strict';

/**
 * server/config/CurrencyRegistry.js
 * ==================================
 * CommonJS Enterprise Currency Release Registry for NoteStandard Server.
 * Single source of truth for currency availability, environment status, and release management.
 */

const CURRENCY_REGISTRY = [
  {
    code: "NGN",
    name: "Nigerian Naira",
    symbol: "₦",
    flag: "🇳🇬",
    status: "LIVE",
    provider: "fincra",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["CARD", "VIRTUAL_ACCOUNT", "BANK_TRANSFER"],
    supportedWithdrawalMethods: ["BANK_TRANSFER"],
    supportedSwapMethods: ["USD", "USDT", "USDC", "CNGN", "BTC", "ETH"]
  },
  {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    flag: "🇺🇸",
    status: "LIVE",
    provider: "grey",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["ACH", "WIRE", "CARD"],
    supportedWithdrawalMethods: ["BANK_TRANSFER", "P2P"],
    supportedSwapMethods: ["NGN", "USDT", "USDC", "CNGN", "BTC", "ETH"]
  },
  {
    code: "USDT",
    name: "Tether",
    symbol: "₮",
    flag: "🟢",
    status: "LIVE",
    provider: "fincra",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["ON_CHAIN", "CARD", "WIRE"],
    supportedWithdrawalMethods: ["ON_CHAIN", "BANK_TRANSFER"],
    supportedSwapMethods: ["USD", "NGN", "USDC", "BTC", "ETH"]
  },
  {
    code: "USDC",
    name: "USD Coin",
    symbol: "●",
    flag: "🔵",
    status: "LIVE",
    provider: "fincra",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["ON_CHAIN", "CARD", "WIRE"],
    supportedWithdrawalMethods: ["ON_CHAIN", "BANK_TRANSFER"],
    supportedSwapMethods: ["USD", "NGN", "USDT", "BTC", "ETH"]
  },
  {
    code: "CNGN",
    name: "eNaira / CNGN",
    symbol: "e₦",
    flag: "🇳🇬",
    status: "LIVE",
    provider: "fincra",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["BANK_TRANSFER"],
    supportedWithdrawalMethods: ["BANK_TRANSFER"],
    supportedSwapMethods: ["USD", "NGN", "USDT", "USDC"]
  },
  {
    code: "BTC",
    name: "Bitcoin",
    symbol: "₿",
    flag: "🟠",
    status: "LIVE",
    provider: "nowpayments",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["ON_CHAIN"],
    supportedWithdrawalMethods: ["ON_CHAIN"],
    supportedSwapMethods: ["USD", "NGN", "USDT", "USDC", "ETH"]
  },
  {
    code: "ETH",
    name: "Ethereum",
    symbol: "Ξ",
    flag: "🔷",
    status: "LIVE",
    provider: "nowpayments",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["ON_CHAIN"],
    supportedWithdrawalMethods: ["ON_CHAIN"],
    supportedSwapMethods: ["USD", "NGN", "USDT", "USDC", "BTC"]
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    flag: "🇪🇺",
    status: "DEVELOPMENT",
    provider: "grey",
    enabled: false,
    visible: false,
    comingSoon: true,
    releaseStage: "BETA",
    supportedDepositMethods: ["SEPA", "CARD"],
    supportedWithdrawalMethods: ["SEPA"],
    supportedSwapMethods: ["USD", "NGN"]
  },
  {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    flag: "🇬🇧",
    status: "DEVELOPMENT",
    provider: "grey",
    enabled: false,
    visible: false,
    comingSoon: true,
    releaseStage: "BETA",
    supportedDepositMethods: ["FPS", "CARD"],
    supportedWithdrawalMethods: ["FPS"],
    supportedSwapMethods: ["USD", "NGN"]
  },
  {
    code: "CAD",
    name: "Canadian Dollar",
    symbol: "CA$",
    flag: "🇨🇦",
    status: "DEVELOPMENT",
    provider: "grey",
    enabled: false,
    visible: true,
    comingSoon: true,
    releaseStage: "ALPHA",
    supportedDepositMethods: ["E_TRANSFER"],
    supportedWithdrawalMethods: ["E_TRANSFER"],
    supportedSwapMethods: ["USD"]
  },
  {
    code: "AUD",
    name: "Australian Dollar",
    symbol: "A$",
    flag: "🇦🇺",
    status: "DEVELOPMENT",
    provider: "grey",
    enabled: false,
    visible: true,
    comingSoon: true,
    releaseStage: "ALPHA",
    supportedDepositMethods: ["PAYID"],
    supportedWithdrawalMethods: ["BANK_TRANSFER"],
    supportedSwapMethods: ["USD"]
  },
  {
    code: "ZAR",
    name: "South African Rand",
    symbol: "R",
    flag: "🇿🇦",
    status: "DEVELOPMENT",
    provider: "grey",
    enabled: false,
    visible: false,
    comingSoon: true,
    releaseStage: "PLANNED",
    supportedDepositMethods: ["EFT"],
    supportedWithdrawalMethods: ["EFT"],
    supportedSwapMethods: ["USD"]
  },
  {
    code: "GHS",
    name: "Ghanaian Cedi",
    symbol: "GH₵",
    flag: "🇬🇭",
    status: "LIVE",
    provider: "fincra",
    enabled: true,
    visible: true,
    comingSoon: false,
    releaseStage: "PROD_READY",
    supportedDepositMethods: ["MOBILE_MONEY", "BANK_TRANSFER", "CARD"],
    supportedWithdrawalMethods: ["MOBILE_MONEY", "BANK_TRANSFER"],
    supportedSwapMethods: ["USD", "NGN"]
  }
];

const getCurrencyFromRegistry = (code) => {
  return CURRENCY_REGISTRY.find(c => c.code.toUpperCase() === String(code || '').toUpperCase());
};

module.exports = {
  CURRENCY_REGISTRY,
  getCurrencyFromRegistry
};
