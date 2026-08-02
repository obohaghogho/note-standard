'use strict';

/**
 * ProviderFailoverService.js
 * ===========================
 * Service for error classification & failover policy evaluation.
 * Allows failover ONLY for retryable infrastructure errors (503, 504, CONNECTION_RESET).
 * Blocks failover for business validation failures (INSUFFICIENT_FUNDS, KYC_FAILED).
 */
class ProviderFailoverService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
  }

  /**
   * Classify error and evaluate whether failover to secondary provider is permitted
   */
  async evaluateFailover(error) {
    const errorMsg = String(error.message || error).toUpperCase();

    const isInfrastructureError = (
      errorMsg.includes('503') ||
      errorMsg.includes('504') ||
      errorMsg.includes('TIMEOUT') ||
      errorMsg.includes('CONNECTION_RESET') ||
      errorMsg.includes('GATEWAY')
    );

    const isBusinessValidationError = (
      errorMsg.includes('INSUFFICIENT_FUNDS') ||
      errorMsg.includes('INVALID_ACCOUNT') ||
      errorMsg.includes('KYC_FAILED') ||
      errorMsg.includes('DUPLICATE_REFERENCE')
    );

    if (isBusinessValidationError) {
      return {
        allowFailover: false,
        classification: 'BUSINESS_VALIDATION',
        reason: 'Failover forbidden for business rule validation failures.'
      };
    }

    if (isInfrastructureError) {
      return {
        allowFailover: true,
        classification: 'RETRYABLE_INFRASTRUCTURE',
        reason: 'Retryable infrastructure error detected; failover permitted.'
      };
    }

    return {
      allowFailover: false,
      classification: 'UNKNOWN',
      reason: 'Unknown error type; default failover blocked for safety.'
    };
  }
}

module.exports = ProviderFailoverService;
