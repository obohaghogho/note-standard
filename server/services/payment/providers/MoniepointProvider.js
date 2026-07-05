const axios = require("axios");
const BaseProvider = require("./BaseProvider");
const logger = require("../../../utils/logger");

class MoniepointProvider extends BaseProvider {
  constructor() {
    super();
    this.apiKey = process.env.MONIEPOINT_API_KEY || "moniepoint_test_placeholder";
    this.baseUrl = "https://api.moniepoint.com/v1";
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
      checkoutUrl: `https://moniepoint.com/pay/mock_${reference}`,
      providerReference: `mon_${reference}`,
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
      display_label: "Moniepoint Deposit",
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
      bankName: "Moniepoint Microfinance Bank",
      accountNumber: `603${Math.floor(1000000 + Math.random() * 9000000)}`,
      accountName: email.split("@")[0].toUpperCase(),
      currency: currency.toUpperCase(),
      reference: `va_moniepoint_${Date.now()}`,
      provider: "moniepoint",
    };
  }

  async transfer(data) {
    return {
      success: true,
      status: "success",
      reference: `tr_moniepoint_${Date.now()}`,
    };
  }

  async reverse(reference, reason) {
    return {
      success: true,
      status: "reversed",
      reference: `re_moniepoint_${Date.now()}`,
    };
  }

  async balanceInquiry(currency) {
    return { balance: 25000000.0, currency: currency.toUpperCase() };
  }

  async healthCheck() {
    return { status: "healthy", latencyMs: 38 };
  }

  async settlement(data) {
    return [];
  }
}

module.exports = MoniepointProvider;
