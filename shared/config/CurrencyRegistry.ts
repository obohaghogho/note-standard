/**
 * shared/config/CurrencyRegistry.ts
 * ====================================
 * Enterprise Currency Release Registry for NoteStandard.
 * Single source of truth for all currency metadata, availability, and release stages.
 */

export type CurrencyStatus = 'LIVE' | 'DEVELOPMENT' | 'COMING_SOON';
export type ReleaseStage = 'PROD_READY' | 'BETA' | 'ALPHA' | 'PLANNED';

export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  status: CurrencyStatus;
  provider: string;
  enabled: boolean;
  visible: boolean;
  comingSoon: boolean;
  releaseStage: ReleaseStage;
  supportedDepositMethods: string[];
  supportedWithdrawalMethods: string[];
  supportedSwapMethods: string[];
}

export const CURRENCY_REGISTRY: CurrencyConfig[] = [
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
    supportedSwapMethods: ["USD"]
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
    supportedSwapMethods: ["NGN"]
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    flag: "🇪🇺",
    status: "DEVELOPMENT",
    provider: "grey",
    enabled: false,
    visible: true,
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
    visible: true,
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
    visible: true,
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
    status: "DEVELOPMENT",
    provider: "fincra",
    enabled: false,
    visible: true,
    comingSoon: true,
    releaseStage: "BETA",
    supportedDepositMethods: ["MOBILE_MONEY", "BANK_TRANSFER", "CARD"],
    supportedWithdrawalMethods: ["MOBILE_MONEY", "BANK_TRANSFER"],
    supportedSwapMethods: ["USD", "NGN"]
  }
];

export const getCurrencyFromRegistry = (code: string): CurrencyConfig | undefined => {
  return CURRENCY_REGISTRY.find(c => c.code.toUpperCase() === String(code).toUpperCase());
};
