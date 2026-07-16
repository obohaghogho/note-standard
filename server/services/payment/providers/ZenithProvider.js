const axios = require("axios");
const BaseProvider = require("./BaseProvider");
const logger = require("../../../utils/logger");

class ZenithProvider extends BaseProvider {
  constructor() {
    super();
    this.apiKey = process.env.ZENITH_API_KEY || "zenith_test_placeholder";
    this.baseUrl = "https://api.zenithbank.com/v1";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
    });
  }

  async initialize(data) {
    const { reference, amount } = data;
    return {
      checkoutUrl: `https://zenith.directpay.com/pay/mock_${reference}`,
      providerReference: `zen_${reference}`,
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
      display_label: "Zenith Deposit",
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
      bankName: "Zenith Bank PLC",
      accountNumber: `507${Math.floor(1000000 + Math.random() * 9000000)}`,
      accountName: email.split("@")[0].toUpperCase(),
      currency: currency.toUpperCase(),
      reference: `va_zenith_${Date.now()}`,
      provider: "zenith",
    };
  }

  async transfer(data) {
    return {
      success: true,
      status: "success",
      reference: `tr_zenith_${Date.now()}`,
    };
  }

  async reverse(reference, reason) {
    return {
      success: true,
      status: "reversed",
      reference: `re_zenith_${Date.now()}`,
    };
  }

  async balanceInquiry(currency) {
    return { balance: 10000000.0, currency: currency.toUpperCase() };
  }

  async healthCheck() {
    return { status: "healthy", latencyMs: 45 };
  }

  async settlement(data) {
    return [];
  }
}

module.exports = ZenithProvider;
