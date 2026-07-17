const PaystackProvider = require("./payment/providers/PaystackProvider");
const logger = require("../utils/logger");
const SystemState = require("../config/SystemState");

/**
 * Subscription Service
 * Generic coordinator for all recurring billing operations.
 * Currently uses Paystack as the default provider for fiat subscriptions.
 */
class SubscriptionService {
  constructor() {
    this.defaultProvider = PaystackProvider;
  }

  async initializeSubscription({ userId, email, amount, currency, planId }) {
    if (!SystemState.getFeatureFlag('feature_new_subscription')) {
      throw new Error("New Subscription subsystem is currently disabled via feature flags.");
    }
    
    // As per user refinement: Subscriptions remain Paystack card-only for now.
    // However, they are routed through the Provider abstraction.
    logger.info(`[SubscriptionService] Initializing ${currency} subscription for User:${userId}`);
    
    const result = await this.defaultProvider.initializeSubscription({
      userId,
      email,
      amount,
      currency,
      planId
    });

    return result;
  }

  async verifySubscription(reference) {
    logger.info(`[SubscriptionService] Verifying subscription payment for Ref:${reference}`);
    return await this.defaultProvider.verifyPayment(reference);
  }

  async cancelSubscription(subscriptionCode) {
    logger.info(`[SubscriptionService] Cancelling subscription Code:${subscriptionCode}`);
    return await this.defaultProvider.cancelSubscription(subscriptionCode);
  }
}

module.exports = new SubscriptionService();
