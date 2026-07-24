/**
 * Fincra Integration — Custom Error Classes
 * ──────────────────────────────────────────
 * All Fincra-specific errors extend from FincraError.
 * This keeps error handling isolated from NoteStandard's existing error system.
 */

class FincraError extends Error {
  constructor(message, code = "FINCRA_ERROR", statusCode = 500) {
    super(message);
    this.name    = "FincraError";
    this.code    = code;
    this.statusCode = statusCode;
  }
}

class FincraApiError extends FincraError {
  constructor(message, statusCode = 500, responseData = null) {
    super(message, "FINCRA_API_ERROR", statusCode);
    this.name         = "FincraApiError";
    this.responseData = responseData;
  }
}

class FincraSignatureError extends FincraError {
  constructor(message = "Invalid or missing Fincra webhook signature") {
    super(message, "FINCRA_SIGNATURE_ERROR", 401);
    this.name = "FincraSignatureError";
  }
}

class FincraDuplicateEventError extends FincraError {
  constructor(eventHash) {
    super(`Duplicate Fincra webhook event rejected: ${eventHash}`, "FINCRA_DUPLICATE_EVENT", 200);
    this.name      = "FincraDuplicateEventError";
    this.eventHash = eventHash;
  }
}

class FincraInsufficientFundsError extends FincraError {
  constructor(available, required, currency) {
    super(
      `Insufficient funds: available ${available} ${currency}, required ${required} ${currency}`,
      "FINCRA_INSUFFICIENT_FUNDS",
      400
    );
    this.name = "FincraInsufficientFundsError";
  }
}

class FincraDisabledError extends FincraError {
  constructor() {
    super("Fincra integration is currently disabled (ENABLE_FINCRA=false)", "FINCRA_DISABLED", 503);
    this.name = "FincraDisabledError";
  }
}

module.exports = {
  FincraError,
  FincraApiError,
  FincraSignatureError,
  FincraDuplicateEventError,
  FincraInsufficientFundsError,
  FincraDisabledError,
};
