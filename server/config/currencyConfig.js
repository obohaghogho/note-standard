/**
 * CurrencyConfig — Canonical Multi-Currency Routing Module
 * =========================================================
 * NoteStandard DFOS v6.4
 *
 * This is the SINGLE source of truth for all currency routing decisions.
 *
 * Routing Philosophy (UPDATED for True Multi-Currency):
 *  - NGN, USD, GBP, EUR → Paystack natively (if using card method). No implicit conversion!
 *  - JPY → Not supported by Paystack natively. We currently do not support it for card checkout.
 */

const { supportsCurrency } = require('./providerCapabilities');
const { getMetadata } = require('./currencyMetadata');

// ── Paystack Gateway-Supported Currencies ──────────────────────────────────────
// Removed hardcoded constraints. We now defer to providerCapabilities.js.
// However, we export this as a helper that uses the registry.
function isPaystackNative(currency) {
  return supportsCurrency('paystack', currency);
}

// ── Wallet Currencies Requiring Gateway Conversion ────────────────────────
// REMOVED: We no longer auto-convert USD, EUR, or GBP to NGN.
// If a user selects USD, we pass USD to Paystack.
const GATEWAY_CONVERSION_MAP = {}; 

function requiresGatewayConversion(currency) {
  return false; // Removed all legacy automatic gateway conversions
}

function getGatewayConversionTarget(currency) {
  return null;
}

// ── FX Volatility Buffer ──────────────────────────────────────────────────────
// Used only for explicit internal swaps (Wallet -> Wallet), NEVER for deposit checkout.
const FX_VOLATILITY_BUFFER = 0.01; // 1%

// ── Bank Transfer Support Matrix ──────────────────────────────────────────────
// Active = full fiat banking support via Fincra.
// coming_soon = not yet enabled for NoteStandard; display-only.
const BANK_TRANSFER_SUPPORT = {
  // Core fiat — Fincra
  NGN:  { provider: "fincra",  supported: true },
  USD:  { provider: "fincra",  supported: true },
  EUR:  { provider: "fincra",  supported: true },
  GBP:  { provider: "fincra",  supported: true },
  CAD:  { provider: "fincra",  supported: true },
  // African fiat — Fincra
  GHS:  { provider: "fincra",  supported: true },
  KES:  { provider: "fincra",  supported: true },
  TZS:  { provider: "fincra",  supported: true },
  UGX:  { provider: "fincra",  supported: true },
  ZAR:  { provider: "fincra",  supported: true },
  XOF:  { provider: "fincra",  supported: true },
  MWK:  { provider: "fincra",  supported: true },
  RWF:  { provider: "fincra",  supported: true },
  XAF:  { provider: "fincra",  supported: true },
  ZMW:  { provider: "fincra",  supported: true },
  EGP:  { provider: "fincra",  supported: true },
  // Asian fiat — Fincra
  CNY:  { provider: "fincra",  supported: true },
  CNH:  { provider: "fincra",  supported: true },
  // Stablecoins — Fincra merchant wallet (fiat settlement layer)
  USDT: { provider: "fincra",  supported: true },
  USDC: { provider: "fincra",  supported: true },
  // Digital currency — Fincra
  CNGN: { provider: "fincra",  supported: true },
  // Coming soon — provider not yet active for NoteStandard
  AUD: {
    provider: null, supported: false,
    message: "AUD will become available after provider approval.",
    fallbackCurrency: "USD",
  },
  NZD: {
    provider: null, supported: false,
    message: "NZD will become available after provider approval.",
    fallbackCurrency: "USD",
  },
  JPY: {
    provider: null, supported: false,
    message: "JPY will become available after provider approval.",
    fallbackCurrency: "USD",
  },
};

// ── Supported Wallet Currencies ───────────────────────────────────────────────
// All currencies for which wallets can be created and balances maintained.
const SUPPORTED_WALLET_CURRENCIES = new Set([
  "NGN","USD","EUR","GBP","CAD",
  "GHS","KES","TZS","UGX","ZAR",
  "XOF","MWK","RWF","XAF","ZMW",
  "EGP","CNY","CNH","USDT","USDC",
  "CNGN",
  // Coming soon — wallet records exist but no transactions permitted
  "AUD","NZD","JPY",
]);

// ── Coming Soon Currencies ────────────────────────────────────────────────────
// Approved by Fincra but not yet enabled. Display only.
const COMING_SOON_CURRENCIES = new Set(["AUD", "NZD", "JPY"]);

// ── Supported Bank Account Currencies ────────────────────────────────────────
const SUPPORTED_BANK_ACCOUNT_CURRENCIES = new Set([
  "NGN","USD","EUR","GBP","CAD",
  "GHS","KES","TZS","UGX","ZAR",
  "XOF","MWK","RWF","XAF","ZMW",
  "EGP","CNY","CNH","USDT","USDC",
  "CNGN",
]);



// ── Helper Functions ──────────────────────────────────────────────────────────

function getBankTransferSupport(currency) {
  return (
    BANK_TRANSFER_SUPPORT[(currency || "").toUpperCase()] || {
      provider: null,
      supported: false,
      message: `Bank transfers in ${currency} are not currently supported. Please use a supported currency (NGN, USD, EUR, GBP).`,
    }
  );
}

function getDecimals(currency) {
  try {
    return getMetadata(currency).decimals;
  } catch(e) {
    return 2;
  }
}

function isSupportedWalletCurrency(currency) {
  return SUPPORTED_WALLET_CURRENCIES.has((currency || "").toUpperCase());
}

module.exports = {
  // Legacy exports maintained to prevent cascading breaks during migration
  PAYSTACK_NATIVE_CURRENCIES: new Set(["NGN", "USD", "EUR", "GBP", "GHS", "ZAR", "KES", "EGP"]),
  GATEWAY_CONVERSION_MAP,
  FX_VOLATILITY_BUFFER,
  BANK_TRANSFER_SUPPORT,
  SUPPORTED_WALLET_CURRENCIES,
  SUPPORTED_BANK_ACCOUNT_CURRENCIES,
  COMING_SOON_CURRENCIES,
  
  requiresGatewayConversion,
  getGatewayConversionTarget,
  isPaystackNative,
  getBankTransferSupport,
  getDecimals,
  isSupportedWalletCurrency,
};

