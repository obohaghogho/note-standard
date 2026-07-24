/**
 * PaymentErrors.js
 * ================
 * Standardized Payment Error Hierarchy — Enterprise DFOS v6.4
 */

class PaymentError extends Error {
  constructor(message, errorCode, statusCode = 400, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class QuoteExpiredError extends PaymentError {
  constructor(message = "FX quote has expired. Please request a new quote.", details = {}) {
    super(message, "QUOTE_EXPIRED", 409, details);
  }
}

class UnsupportedCurrencyError extends PaymentError {
  constructor(currency, message = `Currency ${currency} is not supported.`, details = {}) {
    super(message, "UNSUPPORTED_CURRENCY", 400, { currency, ...details });
  }
}

class GatewayUnavailableError extends PaymentError {
  constructor(provider, message = `Payment gateway ${provider} is currently unavailable.`, details = {}) {
    super(message, "GATEWAY_UNAVAILABLE", 503, { provider, ...details });
  }
}

class FxRateUnavailableError extends PaymentError {
  constructor(pair, message = `Exchange rate unavailable for ${pair}.`, details = {}) {
    super(message, "FX_RATE_UNAVAILABLE", 503, { pair, ...details });
  }
}

class WalletNotFoundError extends PaymentError {
  constructor(currency, message = `Wallet for currency ${currency} not found.`, details = {}) {
    super(message, "WALLET_NOT_FOUND", 404, { currency, ...details });
  }
}

class InsufficientBalanceError extends PaymentError {
  constructor(message = "Insufficient wallet balance to perform this operation.", details = {}) {
    super(message, "INSUFFICIENT_BALANCE", 400, details);
  }
}

class PaymentAlreadyProcessedError extends PaymentError {
  constructor(txId, message = `Payment ${txId} has already been processed.`, details = {}) {
    super(message, "PAYMENT_ALREADY_PROCESSED", 409, { txId, ...details });
  }
}

module.exports = {
  PaymentError,
  QuoteExpiredError,
  UnsupportedCurrencyError,
  GatewayUnavailableError,
  FxRateUnavailableError,
  WalletNotFoundError,
  InsufficientBalanceError,
  PaymentAlreadyProcessedError,
};
