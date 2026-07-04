const axios = require("axios");
const BaseProvider = require("./BaseProvider");
const logger = require("../../../utils/logger");

class ProvidusProvider extends BaseProvider {
  constructor() {
    super();
    this.apiKey = process.env.PROVIDUS_API_KEY || "providus_test_placeholder";
    this.baseUrl = "https://api.providusbank.com/v1";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async initialize(data) {
    const { reference } = data;
    return {
      checkoutUrl: `https://providusbank.com/pay/mock_${reference}`,
      providerReference: `pro_${reference}`,
    };
  }

  async verify(reference) {
    return { success: true, status: "success", amount: 1000, currency: "NGN", reference };
  }

  verifyWebhookSignature(headers, body, rawBody = null) {
    return true;
  }

  parseWebhookEvent(payload) {
    return {
      type: "DEPOSIT",
      display_label: "Providus Deposit",
      reference: payload.reference || payload.id,
      status: "success",
      amount: payload.amount || 0,
      currency: "NGN",
      userId: payload.userId,
      raw: payload,
    };
  }

  async createVirtualAccount(data) {
    const { currency, email } = data;
    return {
      bankName: "Providus Bank",
      accountNumber: `101${Math.floor(1000000 + Math.random() * 9000000)}`,
      accountName: email.split("@")[0].toUpperCase(),
      currency: currency.toUpperCase(),
      reference: `va_providus_${Date.now()}`,
      provider: "providus",
    };
  }

  async transfer(data) {
    return {
      success: true,
      status: "success",
      reference: `tr_providus_${Date.now()}`,
    };
  }

  async reverse(reference, reason) {
    return {
      success: true,
      status: "reversed",
      reference: `re_providus_${Date.now()}`,
    };
  }

  async balanceInquiry(currency) {
    return { balance: 40000000.0, currency: currency.toUpperCase() };
  }

  async healthCheck() {
    return { status: "healthy", latencyMs: 50 };
  }

  async settlement(data) {
    return [];
  }
}

module.exports = ProvidusProvider;
