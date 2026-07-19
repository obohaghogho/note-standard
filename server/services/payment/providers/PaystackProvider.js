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
      // Paystack returns 404 if plan is provided but invalid (e.g. "FREE").
      // Only pass plan if it looks like a valid Paystack plan code (PLN_...)
      if (plan && plan.startsWith('PLN_')) payload.plan = plan;

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
  async createVirtualAccount(data) {
    const { email, firstName, lastName, phone } = data;
    try {
      const startTime = Date.now();
      
      // Step 1: Create or Fetch Paystack Customer
      logger.info(`[PaystackProvider] Resolving customer code for ${email}`);
      let customerCode = "";
      try {
        const customerResponse = await axios.post(
          `${PAYSTACK_BASE_URL}/customer`,
          {
            email,
            first_name: firstName || email.split("@")[0],
            last_name: lastName || "User",
            phone: phone || "",
          },
          { headers: this.getHeaders() }
        );
        customerCode = customerResponse.data.data.customer_code;
      } catch (custErr) {
        // If customer already exists, fetch the details
        if (custErr.response?.status === 400 || custErr.response?.data?.message?.includes("exists")) {
          const fetchResponse = await axios.get(
            `${PAYSTACK_BASE_URL}/customer/${encodeURIComponent(email)}`,
            { headers: this.getHeaders() }
          );
          customerCode = fetchResponse.data.data.customer_code;
        } else {
          throw custErr;
        }
      }

      if (!customerCode) {
        throw new Error("Failed to resolve Paystack customer code");
      }

      // Step 2: Create Dedicated Virtual Account
      logger.info(`[PaystackProvider] Creating dedicated virtual account for customer: ${customerCode}`);
      const dvaResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/dedicated_account`,
        {
          customer: customerCode,
          preferred_bank: "wema-bank",
        },
        { headers: this.getHeaders() }
      );
      
      HealthMonitorService.recordLatency('paystack', Date.now() - startTime);
      
      const accountDetails = dvaResponse.data.data;
      // Dedicated virtual account response has bank name, account number, account name, etc.
      // Paystack response structure includes wema-bank or similar in banks list
      const primaryBank = accountDetails.bank || (accountDetails.banks && accountDetails.banks[0]) || {};
      
      return {
        bankName: primaryBank.name || "Wema Bank",
        accountNumber: accountDetails.account_number || primaryBank.account_number,
        accountName: accountDetails.account_name,
        currency: "NGN",
        reference: `va_paystack_${Date.now()}`,
        provider: "paystack",
        providerCustomerCode: customerCode,
        providerAccountId: String(accountDetails.id),
        rawResponse: dvaResponse.data.data,
      };
    } catch (error) {
      logger.error("[PaystackProvider] Dedicated Virtual Account creation failed:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Paystack DVA generation failed");
    }
  }
}

module.exports = PaystackProvider;
