/**
 * Fincra Integration — Constants
 * ──────────────────────────────
 * Central reference for all Fincra-related enumerations.
 * DO NOT mix these with existing NoteStandard constants.
 */

// Supported fiat currencies through Fincra.
// Updated to include all Fincra-approved merchant wallet currencies.
// USDT and USDC are Fincra merchant wallet stablecoins (fiat settlement).
// They are separate from the NowPayments on-chain custody path.
// Crypto assets (BTC, ETH) are NEVER connected to this module.
const FINCRA_CURRENCIES = Object.freeze({
  // Core fiat
  NGN:  "NGN",
  USD:  "USD",
  EUR:  "EUR",
  GBP:  "GBP",
  CAD:  "CAD",
  // African fiat
  GHS:  "GHS",
  KES:  "KES",
  TZS:  "TZS",
  UGX:  "UGX",
  ZAR:  "ZAR",
  XOF:  "XOF",
  MWK:  "MWK",
  RWF:  "RWF",
  XAF:  "XAF",
  ZMW:  "ZMW",
  EGP:  "EGP",
  // Asian fiat
  CNY:  "CNY",
  CNH:  "CNH",
  // Stablecoins (Fincra merchant wallet settlement layer)
  USDT: "USDT",
  USDC: "USDC",
  // Digital currency
  CNGN: "CNGN",
});

// O(1) set for validation at the service layer
const FINCRA_SUPPORTED_SET = new Set(Object.values(FINCRA_CURRENCIES));

// Currencies approved by Fincra but not yet available for NoteStandard users.
// These are displayed as "Coming Soon" in the UI but no transactions are allowed.
const FINCRA_COMING_SOON_SET = new Set(["AUD", "NZD", "JPY", "EUR", "GBP"]);

// All currencies Fincra recognises (active + coming soon)
const FINCRA_ALL_FIAT_SET = new Set([...FINCRA_SUPPORTED_SET, ...FINCRA_COMING_SOON_SET]);



// Complete state machine for Fincra transactions.
// CREATED    → Record initialised, no action sent.
// PENDING    → Awaiting Fincra API or webhook response.
// RESERVED   → User funds locked in NoteStandard ledger (withdrawals only).
// PROCESSING → Fincra is actively processing the payment.
// SUCCESSFUL → Event confirmed, ledger commit executed.
// FAILED     → Fincra or internal failure, no balance change.
// REVERSED   → Fund reservation reversed, balance returned to user.
const FINCRA_TX_STATUS = Object.freeze({
  CREATED:                  "CREATED",
  REQUESTED:                "REQUESTED",
  CRYPTO_RESERVED:          "CRYPTO_RESERVED",
  OTC_FUNDING_PENDING:      "OTC_FUNDING_PENDING",
  OTC_FUNDED:               "OTC_FUNDED",
  FINCRA_BALANCE_CONFIRMED: "FINCRA_BALANCE_CONFIRMED",
  QUOTE_REQUESTED:          "QUOTE_REQUESTED",
  QUOTE_RECEIVED:           "QUOTE_RECEIVED",
  CONVERSION_SUBMITTED:     "CONVERSION_SUBMITTED",
  PENDING:                  "PENDING",
  RESERVED:                 "RESERVED",
  PROCESSING:               "PROCESSING",
  CONVERSION_PROCESSING:    "CONVERSION_PROCESSING",
  SUCCESSFUL:               "SUCCESSFUL",
  CONVERSION_SUCCESSFUL:    "CONVERSION_SUCCESSFUL",
  NGN_SETTLED:              "NGN_SETTLED",
  FAILED:                   "FAILED",
  CONVERSION_FAILED:        "CONVERSION_FAILED",
  FUNDING_FAILED:           "FUNDING_FAILED",
  RECONCILIATION_REQUIRED:  "RECONCILIATION_REQUIRED",
  CANCELLED:                "CANCELLED",
  REVERSED:                 "REVERSED",
});

// Supported crypto assets for Fincra OTC conversion
const SUPPORTED_CRYPTO_CONVERSION_ASSETS = Object.freeze({
  USDT: "USDT",
  USDC: "USDC",
});

const SUPPORTED_CRYPTO_CONVERSION_SET = new Set(Object.values(SUPPORTED_CRYPTO_CONVERSION_ASSETS));

// Explicit allowed conversion pairs (Source-Destination)
// USDT -> NGN and USDC -> NGN are the explicit supported crypto conversion pairs.
// Fiat conversion pairs (NGN ↔ USD ↔ EUR) remain supported as before.
const ALLOWED_CONVERSION_PAIRS = new Set([
  "USDT-NGN",
  "USDC-NGN",
  "NGN-USD",
  "USD-NGN",
  "NGN-EUR",
  "EUR-NGN",
  "USD-EUR",
  "EUR-USD",
]);

// Fincra transaction types
const FINCRA_TX_TYPES = Object.freeze({
  DEPOSIT:    "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  CONVERSION: "CONVERSION",
});

// Fincra webhook event names (as documented in Fincra API)
const FINCRA_EVENTS = Object.freeze({
  COLLECTION_SUCCESSFUL: "collection.successful",
  COLLECTION_FAILED:     "collection.failed",
  PAYOUT_SUCCESSFUL:     "payout.successful",
  PAYOUT_FAILED:         "payout.failed",
  CONVERSION_SUCCESSFUL: "conversion.successful",
  CONVERSION_FAILED:     "conversion.failed",
});

// Valid deposit-type webhook events
const FINCRA_DEPOSIT_EVENTS = new Set([
  FINCRA_EVENTS.COLLECTION_SUCCESSFUL,
]);

// Valid payout-type webhook events
const FINCRA_PAYOUT_EVENTS = new Set([
  FINCRA_EVENTS.PAYOUT_SUCCESSFUL,
  FINCRA_EVENTS.PAYOUT_FAILED,
]);

// API timeouts and retry configuration
const FINCRA_HTTP_TIMEOUT_MS = 15000;
const FINCRA_MAX_RETRIES     = 3;
const FINCRA_RETRY_DELAY_MS  = 500;

module.exports = {
  FINCRA_CURRENCIES,
  FINCRA_SUPPORTED_SET,
  FINCRA_COMING_SOON_SET,
  FINCRA_ALL_FIAT_SET,
  SUPPORTED_CRYPTO_CONVERSION_ASSETS,
  SUPPORTED_CRYPTO_CONVERSION_SET,
  ALLOWED_CONVERSION_PAIRS,
  FINCRA_TX_STATUS,
  FINCRA_TX_TYPES,
  FINCRA_EVENTS,
  FINCRA_DEPOSIT_EVENTS,
  FINCRA_PAYOUT_EVENTS,
  FINCRA_HTTP_TIMEOUT_MS,
  FINCRA_MAX_RETRIES,
  FINCRA_RETRY_DELAY_MS,
};


