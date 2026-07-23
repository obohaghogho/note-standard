/**
 * Fincra Integration — Constants
 * ──────────────────────────────
 * Central reference for all Fincra-related enumerations.
 * DO NOT mix these with existing NoteStandard constants.
 */

// Supported fiat currencies through Fincra.
// Crypto assets are NEVER connected to this module.
const FINCRA_CURRENCIES = Object.freeze({
  NGN: "NGN",
  USD: "USD",
  EUR: "EUR",
});

// Complete state machine for Fincra transactions.
// CREATED    → Record initialised, no action sent.
// PENDING    → Awaiting Fincra API or webhook response.
// RESERVED   → User funds locked in NoteStandard ledger (withdrawals only).
// PROCESSING → Fincra is actively processing the payment.
// SUCCESSFUL → Event confirmed, ledger commit executed.
// FAILED     → Fincra or internal failure, no balance change.
// REVERSED   → Fund reservation reversed, balance returned to user.
const FINCRA_TX_STATUS = Object.freeze({
  CREATED:    "CREATED",
  PENDING:    "PENDING",
  RESERVED:   "RESERVED",
  PROCESSING: "PROCESSING",
  SUCCESSFUL: "SUCCESSFUL",
  FAILED:     "FAILED",
  REVERSED:   "REVERSED",
});

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
  FINCRA_TX_STATUS,
  FINCRA_TX_TYPES,
  FINCRA_EVENTS,
  FINCRA_DEPOSIT_EVENTS,
  FINCRA_PAYOUT_EVENTS,
  FINCRA_HTTP_TIMEOUT_MS,
  FINCRA_MAX_RETRIES,
  FINCRA_RETRY_DELAY_MS,
};
