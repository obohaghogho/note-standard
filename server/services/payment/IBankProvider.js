'use strict';

/**
 * IBankProvider.js
 * ================
 * Standardized Bank Provider Interface Contract for NoteStandard Enterprise Banking Platform (v1.0)
 *
 * All banking provider adapters (FincraAdapter, AnchorAdapter, StripeAdapter, etc.)
 * must implement this contract.
 */
class IBankProvider {
  /**
   * Initialize deposit session / intent checkout.
   * @param {Object} params { amount, currency, email, reference, callbackUrl, metadata }
   * @returns {Promise<Object>} { providerReference, checkoutUrl, expiresAt }
   */
  async deposit(params) {
    throw new Error('NOT_IMPLEMENTED: deposit()');
  }

  /**
   * Process withdrawal / payout to external bank account.
   * @param {Object} params { amount, currency, recipient, reference, narration, metadata }
   * @returns {Promise<Object>} { providerReference, status, estimatedSettlement }
   */
  async withdraw(params) {
    throw new Error('NOT_IMPLEMENTED: withdraw()');
  }

  /**
   * Provision a dedicated virtual bank account.
   * @param {Object} params { userId, currency, name, email, bvn, kycData }
   * @returns {Promise<Object>} { bankName, accountNumber, accountName, routingNumber, bic, currency }
   */
  async createVirtualAccount(params) {
    throw new Error('NOT_IMPLEMENTED: createVirtualAccount()');
  }

  /**
   * Create a remote payment link for collection.
   * @param {Object} params { amount, currency, description, redirectUrl, metadata }
   * @returns {Promise<Object>} { paymentLinkId, linkUrl, expiresAt }
   */
  async createPaymentLink(params) {
    throw new Error('NOT_IMPLEMENTED: createPaymentLink()');
  }

  /**
   * Execute real-time FX conversion quote/execution.
   * @param {Object} params { fromCurrency, toCurrency, amount, quoteId }
   * @returns {Promise<Object>} { conversionId, sourceAmount, targetAmount, rate }
   */
  async convert(params) {
    throw new Error('NOT_IMPLEMENTED: convert()');
  }

  /**
   * Fetch current provider account balances.
   * @returns {Promise<Array>} Array of { currency, availableBalance, ledgerBalance }
   */
  async getBalance() {
    throw new Error('NOT_IMPLEMENTED: getBalance()');
  }

  /**
   * Verify incoming webhook signature & payload.
   * @param {Object} req Express request object containing headers & rawBody
   * @returns {Boolean} true if signature is valid
   */
  verifyWebhook(req) {
    throw new Error('NOT_IMPLEMENTED: verifyWebhook()');
  }

  /**
   * Check live health status & latency of provider API.
   * @returns {Promise<Object>} { status: 'ONLINE'|'DEGRADED'|'OFFLINE', latencyMs: number }
   */
  async healthCheck() {
    throw new Error('NOT_IMPLEMENTED: healthCheck()');
  }
}

module.exports = IBankProvider;
