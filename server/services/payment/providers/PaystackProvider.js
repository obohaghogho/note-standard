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
        customer: data.customer,
        raw: data
      };
    } catch (error) {
      logger.error(`[PaystackProvider] Verify error for ${reference}`, error.response?.data || error.message);
      throw new Error(`Paystack Verification Failed: ${error.message}`);
    }
  }

  async verify(reference) {
    return this.verifyPayment(reference);
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

  /**
   * PayoutProvider Adapter Contract Implementation
   */
  async getMerchantBalance(currency = "NGN") {
    try {
      const response = await axios.get(`${PAYSTACK_BASE_URL}/balance`, {
        headers: this.getHeaders(),
      });
      const list = response.data?.data || [];
      const item = list.find((b) => (b.currency || "").toUpperCase() === currency.toUpperCase()) || list[0] || { balance: 0 };
      return {
        available: (item.balance || 0) / 100,
        ledger: (item.balance || 0) / 100,
        currency: (item.currency || currency).toUpperCase(),
      };
    } catch (error) {
      logger.warn(`[PaystackProvider] Merchant Balance Error: ${error.message}`);
      return { available: 0, ledger: 0, currency: currency.toUpperCase() };
    }
  }

  async initiatePayout(params) {
    try {
      // Step 1: Create Transfer Recipient
      const recipientRes = await axios.post(
        `${PAYSTACK_BASE_URL}/transferrecipient`,
        {
          type: "nuban",
          name: params.accountName || "Beneficiary",
          account_number: params.accountNumber,
          bank_code: params.bankCode,
          currency: params.currency || "NGN",
        },
        { headers: this.getHeaders() }
      );

      const recipientCode = recipientRes.data?.data?.recipient_code;

      // Step 2: Initiate Transfer
      const transferRes = await axios.post(
        `${PAYSTACK_BASE_URL}/transfer`,
        {
          source: "balance",
          amount: Math.round(params.amount * 100),
          recipient: recipientCode,
          reason: params.narration || "NoteStandard payout",
          reference: params.reference,
        },
        { headers: this.getHeaders() }
      );

      const resData = transferRes.data?.data || {};
      return {
        success: true,
        status: (resData.status || "success").toLowerCase(),
        fincraReference: resData.transfer_code || resData.reference,
        reference: resData.reference || params.reference,
        rawResponse: resData,
      };
    } catch (error) {
      logger.error(`[PaystackProvider] Payout Error: ${error.response?.data?.message || error.message}`);
      throw new Error(error.response?.data?.message || "Paystack payout failed");
    }
  }

  async verifyPayout(reference) {
    try {
      const response = await axios.get(`${PAYSTACK_BASE_URL}/transfer/verify/${encodeURIComponent(reference)}`, {
        headers: this.getHeaders(),
      });
      const data = response.data?.data || {};
      return {
        status: data.status === "success" ? "SUCCESSFUL" : data.status,
        reference: data.reference || reference,
        rawResponse: data,
      };
    } catch (error) {
      return { status: "PENDING", reference, rawResponse: {} };
    }
  }

  async resolveAccount({ accountNumber, bankCode }) {
    try {
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
        { headers: this.getHeaders() }
      );
      const data = response.data?.data || {};
      return {
        accountName: data.account_name,
        accountNumber: data.account_number || accountNumber,
        bankCode: bankCode,
      };
    } catch (error) {
      throw new Error(error.response?.data?.message || "Paystack bank account resolution failed");
    }
  }
}

module.exports = PaystackProvider;
