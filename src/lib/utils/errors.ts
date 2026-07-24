// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base error class for all platform errors.
 * Includes an HTTP status code and machine-readable error code.
 */
export class PlatformError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Wallet & Ledger Errors
// ---------------------------------------------------------------------------

export class InsufficientFundsError extends PlatformError {
  constructor(available: number, requested: number, currency: string) {
    super(
      `Insufficient funds. Available: ${available}, Requested: ${requested} (${currency})`,
      400,
      'INSUFFICIENT_FUNDS',
    );
  }
}

export class WalletNotFoundError extends PlatformError {
  constructor(identifier: string) {
    super(`Wallet not found: ${identifier}`, 404, 'WALLET_NOT_FOUND');
  }
}

export class WalletInactiveError extends PlatformError {
  constructor(walletId: string) {
    super(`Wallet is inactive: ${walletId}`, 400, 'WALLET_INACTIVE');
  }
}

export class DuplicateTransactionError extends PlatformError {
  constructor(reference: string) {
    super(
      `Transaction with reference "${reference}" already exists`,
      409,
      'DUPLICATE_TRANSACTION',
    );
  }
}

// ---------------------------------------------------------------------------
// Payment & Provider Errors
// ---------------------------------------------------------------------------

export class PaymentVerificationError extends PlatformError {
  constructor(reference: string, reason?: string) {
    super(
      `Payment verification failed for "${reference}"${reason ? `: ${reason}` : ''}`,
      400,
      'PAYMENT_VERIFICATION_FAILED',
    );
  }
}

export class WebhookSignatureError extends PlatformError {
  constructor(provider: string) {
    super(
      `Invalid webhook signature from provider: ${provider}`,
      401,
      'WEBHOOK_SIGNATURE_INVALID',
    );
  }
}

export class ProviderNotFoundError extends PlatformError {
  constructor(criteria: string) {
    super(
      `No payment provider found matching: ${criteria}`,
      500,
      'PROVIDER_NOT_FOUND',
    );
  }
}

export class ProviderUnhealthyError extends PlatformError {
  constructor(provider: string) {
    super(
      `Provider "${provider}" is currently unhealthy`,
      503,
      'PROVIDER_UNHEALTHY',
    );
  }
}

export class ProviderApiError extends PlatformError {
  public readonly providerMessage: string;

  constructor(provider: string, providerMessage: string, statusCode = 502) {
    super(
      `Provider "${provider}" returned an error: ${providerMessage}`,
      statusCode,
      'PROVIDER_API_ERROR',
    );
    this.providerMessage = providerMessage;
  }
}

// ---------------------------------------------------------------------------
// Risk & Compliance Errors
// ---------------------------------------------------------------------------

export class RiskBlockedError extends PlatformError {
  public readonly reasons: string[];

  constructor(reasons: string[]) {
    super(
      `Transaction blocked by risk engine: ${reasons.join('; ')}`,
      403,
      'RISK_BLOCKED',
    );
    this.reasons = reasons;
  }
}

// ---------------------------------------------------------------------------
// Feature & Config Errors
// ---------------------------------------------------------------------------

export class FeatureDisabledError extends PlatformError {
  constructor(feature: string) {
    super(`Feature "${feature}" is currently disabled`, 403, 'FEATURE_DISABLED');
  }
}

export class CurrencyNotSupportedError extends PlatformError {
  constructor(currency: string) {
    super(
      `Currency "${currency}" is not currently supported or active`,
      400,
      'CURRENCY_NOT_SUPPORTED',
    );
  }
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export class RateLimitExceededError extends PlatformError {
  constructor(operation: string) {
    super(
      `Rate limit exceeded for operation: ${operation}`,
      429,
      'RATE_LIMIT_EXCEEDED',
    );
  }
}

// ---------------------------------------------------------------------------
// Reservation Errors
// ---------------------------------------------------------------------------

export class ReservationNotFoundError extends PlatformError {
  constructor(reservationId: string) {
    super(
      `Reservation not found: ${reservationId}`,
      404,
      'RESERVATION_NOT_FOUND',
    );
  }
}

export class ReservationExpiredError extends PlatformError {
  constructor(reservationId: string) {
    super(
      `Reservation has expired: ${reservationId}`,
      400,
      'RESERVATION_EXPIRED',
    );
  }
}

// ---------------------------------------------------------------------------
// Auth Errors
// ---------------------------------------------------------------------------

export class UnauthorizedError extends PlatformError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends PlatformError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

// ---------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------

export class NotImplementedError extends PlatformError {
  constructor(feature: string) {
    super(
      `"${feature}" is not yet implemented`,
      501,
      'NOT_IMPLEMENTED',
    );
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
