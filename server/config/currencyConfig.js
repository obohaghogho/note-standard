/**
 * CurrencyConfig — Canonical Multi-Currency Routing Module
 * =========================================================
 * NoteStandard DFOS v6.4
 *
 * This is the SINGLE source of truth for all currency routing decisions.
 * All payment services (depositService, PaystackProvider, PaymentFactory)
 * must import from here instead of maintaining their own hardcoded arrays.
 *
 * Routing Philosophy:
 *  - NGN  → Paystack natively (NGN) — no conversion needed
 *  - USD  → Convert to NGN → Paystack (card)
 *  - EUR  → Convert to NGN → Paystack (card) | Grey manual (bank transfer)
 *  - GBP  → Convert to NGN → Paystack (card) | Grey manual (bank transfer)
 *  - JPY  → Convert to NGN → Paystack (card) | Block bank transfer with message
 */

// ── Paystack Gateway-Supported Currencies ──────────────────────────────────────
// NGN is the ONLY currency Nigerian Paystack live accounts (sk_live_*) support
// natively. USD requires a separate Paystack Global merchant account.
// All non-NGN wallet currencies must be pre-converted to NGN before gateway call.
const PAYSTACK_NATIVE_CURRENCIES = new Set(["NGN"]);

// ── Wallet Currencies Requiring Gateway Conversion ────────────────────────
// All non-NGN fiat wallet currencies must be pre-converted to NGN before
// the Paystack API call. The original currency and amount are stored in
// transaction metadata so the wallet is correctly credited post-settlement.
const GATEWAY_CONVERSION_MAP = {
  USD: { targetCurrency: "NGN", method: "card" },
  EUR: { targetCurrency: "NGN", method: "card" },
  GBP: { targetCurrency: "NGN", method: "card" },
  JPY: { targetCurrency: "NGN", method: "card" },
};

// ── FX Volatility Buffer ──────────────────────────────────────────────────────
// Applied to all pre-gateway FX conversions to absorb exchange rate
// fluctuations and processor spread differences.
// This is implicitly embedded in the displayed conversion rate — NOT shown
// as a separate fee line item to the user.
const FX_VOLATILITY_BUFFER = 0.01; // 1%

// ── Bank Transfer Support Matrix ──────────────────────────────────────────────
// Defines which currencies support bank transfer deposits and through which
// provider. Currencies not in this map get a friendly block message.
const BANK_TRANSFER_SUPPORT = {
  NGN: { provider: "paystack_dva", supported: true },
  USD: { provider: "grey", supported: true },
  EUR: { provider: "grey", supported: true },
  GBP: { provider: "grey", supported: true },
  JPY: {
    provider: null,
    supported: false,
    message:
      "JPY bank transfers are currently routed through USD conversion. " +
      "Please use USD for best compatibility.",
    fallbackCurrency: "USD",
  },
};

// ── Currency Display Decimals ─────────────────────────────────────────────────
// Number of decimal places for display and amount formatting.
const CURRENCY_DECIMALS = {
  NGN: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0, // JPY has no minor unit
  BTC: 8,
  ETH: 6,
  USDT: 2,
  USDC: 2,
};

// ── Supported Wallet Currencies ───────────────────────────────────────────────
// The complete set of fiat currencies that can have a wallet ledger in NoteStandard.
const SUPPORTED_WALLET_CURRENCIES = new Set(["NGN", "USD", "EUR", "GBP", "JPY"]);

// ── Supported Bank Account Currencies ────────────────────────────────────────
// Currencies for which a user can register an external bank account for withdrawals.
const SUPPORTED_BANK_ACCOUNT_CURRENCIES = new Set(["USD", "GBP", "EUR", "NGN", "JPY"]);

// ── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Returns true if the currency needs to be converted before sending to the payment gateway.
 * @param {string} currency
 * @returns {boolean}
 */
function requiresGatewayConversion(currency) {
  return Object.prototype.hasOwnProperty.call(
    GATEWAY_CONVERSION_MAP,
    (currency || "").toUpperCase()
  );
}

/**
 * Returns the gateway conversion target for a currency, or null if none needed.
 * @param {string} currency
 * @returns {{ targetCurrency: string, method: string } | null}
 */
function getGatewayConversionTarget(currency) {
  return GATEWAY_CONVERSION_MAP[(currency || "").toUpperCase()] || null;
}

/**
 * Returns true if Paystack can process this currency natively (no pre-conversion).
 * @param {string} currency
 * @returns {boolean}
 */
function isPaystackNative(currency) {
  return PAYSTACK_NATIVE_CURRENCIES.has((currency || "").toUpperCase());
}

/**
 * Returns bank transfer support details for a currency.
 * @param {string} currency
 * @returns {{ provider: string|null, supported: boolean, message?: string, fallbackCurrency?: string }}
 */
function getBankTransferSupport(currency) {
  return (
    BANK_TRANSFER_SUPPORT[(currency || "").toUpperCase()] || {
      provider: null,
      supported: false,
      message: `Bank transfers in ${currency} are not currently supported. Please use a supported currency (NGN, USD, EUR, GBP).`,
    }
  );
}

/**
 * Returns the number of decimal places for a currency.
 * @param {string} currency
 * @returns {number}
 */
function getDecimals(currency) {
  return CURRENCY_DECIMALS[(currency || "").toUpperCase()] ?? 2;
}

/**
 * Returns true if the currency is a supported NoteStandard wallet currency.
 * @param {string} currency
 * @returns {boolean}
 */
function isSupportedWalletCurrency(currency) {
  return SUPPORTED_WALLET_CURRENCIES.has((currency || "").toUpperCase());
}

module.exports = {
  PAYSTACK_NATIVE_CURRENCIES,
  GATEWAY_CONVERSION_MAP,
  FX_VOLATILITY_BUFFER,
  BANK_TRANSFER_SUPPORT,
  CURRENCY_DECIMALS,
  SUPPORTED_WALLET_CURRENCIES,
  SUPPORTED_BANK_ACCOUNT_CURRENCIES,
  // Helpers
  requiresGatewayConversion,
  getGatewayConversionTarget,
  isPaystackNative,
  getBankTransferSupport,
  getDecimals,
  isSupportedWalletCurrency,
};
