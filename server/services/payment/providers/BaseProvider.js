/**
 * Base Payment Provider Class
 * Defines the interface for all payment gateway implementations
 */
class BaseProvider {
  constructor() {
    if (this.constructor === BaseProvider) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  /**
   * Initialize a transaction
   * @param {Object} data - Transaction data
   * @param {string} data.email - Customer email
   * @param {number} data.amount - Amount in currency unit (not smallest unit)
   * @param {string} data.currency - Currency code (NGN, USD, etc.)
   * @param {string} data.reference - Unique transaction reference
   * @param {string} data.callbackUrl - URL to redirect to after payment
   * @param {Object} data.metadata - Additional metadata
   * @returns {Promise<Object>} - Payment initialization response { checkoutUrl, providerReference }
   */
  async initialize(data) {
    throw new Error("Method 'initialize()' must be implemented.");
  }

  /**
   * Verify a transaction
   * @param {string} reference - Provider reference or our reference
   * @returns {Promise<Object>} - Verification response { success, status, amount, currency }
   */
  async verify(reference) {
    throw new Error("Method 'verify()' must be implemented.");
  }

  /**
   * Verify webhook signature
   * @param {Object} headers - Request headers
   * @param {Object|string} body - Request body
   * @returns {boolean} - Whether the signature is valid
   */
  verifyWebhookSignature(headers, body) {
    throw new Error("Method 'verifyWebhookSignature()' must be implemented.");
  }

  /**
   * Map webhook event to unified status
   * @param {Object} payload - Webhook payload
   * @returns {Object} - Unified event { type, reference, status, raw }
   */
  parseWebhookEvent(payload) {
    throw new Error("Method 'parseWebhookEvent()' must be implemented.");
  }
}

module.exports = BaseProvider;
