/**
 * shared/config/fiatCurrencies.ts
 * =================================
 * Single source of truth for fiat currency availability across NoteStandard.
 * Controls environment-based visibility without deleting schemas or provider adapters.
 */

export interface FiatCurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  enabledInProduction: boolean;
  enabledInDevelopment: boolean;
  comingSoon: boolean;
}

export const FIAT_CURRENCIES: FiatCurrencyConfig[] = [
  {
    code: "NGN",
    name: "Nigerian Naira",
    symbol: "₦",
    flag: "🇳🇬",
    enabledInProduction: true,
    enabledInDevelopment: true,
    comingSoon: false
  },
  {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    flag: "🇺🇸",
    enabledInProduction: true,
    enabledInDevelopment: true,
    comingSoon: false
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    flag: "🇪🇺",
    enabledInProduction: false,
    enabledInDevelopment: true,
    comingSoon: true
  },
  {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    flag: "🇬🇧",
    enabledInProduction: false,
    enabledInDevelopment: true,
    comingSoon: true
  },
  {
    code: "CAD",
    name: "Canadian Dollar",
    symbol: "CA$",
    flag: "🇨🇦",
    enabledInProduction: false,
    enabledInDevelopment: true,
    comingSoon: true
  },
  {
    code: "AUD",
    name: "Australian Dollar",
    symbol: "A$",
    flag: "🇦🇺",
    enabledInProduction: false,
    enabledInDevelopment: true,
    comingSoon: true
  },
  {
    code: "ZAR",
    name: "South African Rand",
    symbol: "R",
    flag: "🇿🇦",
    enabledInProduction: false,
    enabledInDevelopment: true,
    comingSoon: true
  },
  {
    code: "GHS",
    name: "Ghanaian Cedi",
    symbol: "GH₵",
    flag: "🇬🇭",
    enabledInProduction: true,
    enabledInDevelopment: true,
    comingSoon: false
  }
];
