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
const BANK_TRANSFER_SUPPORT = {
  NGN: { provider: "paystack_dva", supported: true },
  USD: { provider: "grey", supported: true },
  EUR: { provider: "grey", supported: true },
  GBP: { provider: "grey", supported: true },
  JPY: {
    provider: null,
    supported: false,
    message: "JPY bank transfers are not supported.",
    fallbackCurrency: "USD",
  },
};

// ── Supported Wallet Currencies ───────────────────────────────────────────────
const SUPPORTED_WALLET_CURRENCIES = new Set(["NGN", "USD", "EUR", "GBP", "JPY"]);

// ── Supported Bank Account Currencies ────────────────────────────────────────
const SUPPORTED_BANK_ACCOUNT_CURRENCIES = new Set(["USD", "GBP", "EUR", "NGN", "JPY"]);

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
  // Legacy exports maintained to prevent massive cascading breaks during migration
  PAYSTACK_NATIVE_CURRENCIES: new Set(["NGN", "USD", "GHS", "ZAR", "KES", "EGP"]), 
  GATEWAY_CONVERSION_MAP,
  FX_VOLATILITY_BUFFER,
  BANK_TRANSFER_SUPPORT,
  SUPPORTED_WALLET_CURRENCIES,
  SUPPORTED_BANK_ACCOUNT_CURRENCIES,
  
  requiresGatewayConversion,
  getGatewayConversionTarget,
  isPaystackNative,
  getBankTransferSupport,
  getDecimals,
  isSupportedWalletCurrency,
};
