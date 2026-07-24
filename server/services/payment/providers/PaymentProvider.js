/**
 * Abstract Payment Provider Interface
 */
class PaymentProvider {
  /**
   * Initialize a new recurring subscription
   * @param {Object} params { userId, email, amount, currency, planId }
   * @returns {Promise<Object>} { providerReference, checkoutUrl }
   */
  async initializeSubscription(params) {
    throw new Error('Not implemented');
  }

  /**
   * Verify an existing subscription or one-time payment
   * @param {string} reference
   * @returns {Promise<Object>} { status: 'success' | 'failed', amount, currency, metadata }
   */
  async verifyPayment(reference) {
    throw new Error('Not implemented');
  }

  /**
   * Cancel an active subscription
   * @param {string} subscriptionCode
   * @returns {Promise<boolean>}
   */
  async cancelSubscription(subscriptionCode) {
    throw new Error('Not implemented');
  }
}

module.exports = PaymentProvider;
