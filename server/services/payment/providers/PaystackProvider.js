const PaymentProvider = require("./PaymentProvider");
const axios = require("axios");
const HealthMonitorService = require("../../HealthMonitorService");
const logger = require("../../../utils/logger");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

class PaystackProvider extends PaymentProvider {
  getHeaders() {
    return {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    };
  }

  async initialize(data) {
    const { email, amount, currency, reference, callbackUrl, plan, metadata } = data;
    try {
      const startTime = Date.now();
      const payload = {
        email,
        amount: Math.round(amount * 100), // Paystack uses kobo/cents
        currency: String(currency).toUpperCase(),
        callback_url: callbackUrl,
        metadata: JSON.stringify(metadata),
      };

      if (reference) payload.reference = reference;
      if (plan) payload.plan = plan;

      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        payload,
        { headers: this.getHeaders() }
      );
      HealthMonitorService.recordLatency('paystack', Date.now() - startTime);

      return {
        checkoutUrl: response.data.data.authorization_url,
        providerReference: response.data.data.reference,
        link: response.data.data.authorization_url
      };
    } catch (error) {
      logger.error("[PaystackProvider] Init error", error.response?.data || error.message);
      throw new Error(`Paystack Init Failed: ${error.message}`);
    }
  }

  async initializeSubscription({ userId, email, amount, currency, planId }) {
    try {
      const startTime = Date.now();
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email,
          amount: amount * 100, // Paystack uses kobo
          currency,
          plan: planId,
          metadata: { userId, type: 'subscription' }
        },
        { headers: this.getHeaders() }
      );
      HealthMonitorService.recordLatency('paystack', Date.now() - startTime);

      return {
        providerReference: response.data.data.reference,
        checkoutUrl: response.data.data.authorization_url
      };
    } catch (error) {
      logger.error("[PaystackProvider] Init error", error.response?.data || error.message);
      throw new Error(`Paystack Subscription Init Failed: ${error.message}`);
    }
  }

  async verifyPayment(reference) {
    try {
      const startTime = Date.now();
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: this.getHeaders() }
      );
      HealthMonitorService.recordLatency('paystack', Date.now() - startTime);

      const data = response.data.data;
      return {
        status: data.status, // 'success', 'failed', 'abandoned'
        amount: data.amount / 100,
        currency: data.currency,
        metadata: data.metadata,
        customer: data.customer
      };
    } catch (error) {
      logger.error(`[PaystackProvider] Verify error for ${reference}`, error.response?.data || error.message);
      throw new Error(`Paystack Verification Failed: ${error.message}`);
    }
  }

  async cancelSubscription(subscriptionCode) {
    try {
      // Paystack requires subscription code and token. Often just sending code via a specific endpoint works or disable via API.
      // This is a simplified wrapper.
      const startTime = Date.now();
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/subscription/disable`,
        { code: subscriptionCode, token: "dummy_token_needs_db_lookup" },
        { headers: this.getHeaders() }
      );
      HealthMonitorService.recordLatency('paystack', Date.now() - startTime);
      return response.data.status;
    } catch (error) {
      logger.error(`[PaystackProvider] Cancel error for ${subscriptionCode}`, error.response?.data || error.message);
      throw new Error(`Paystack Cancel Failed: ${error.message}`);
    }
  }
}

module.exports = new PaystackProvider();
