/**
 * Custom Error class for API responses.
 * Allows passing a status code and an optional error code (e.g. 'INSUFFICIENT_FUNDS').
 */
class ApiError extends Error {
  constructor(statusCode, message, errorCode = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true; // Indicates this is a known, handled error

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
