const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");

class PaystackProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseUrl = "https://api.paystack.co";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async initialize(data) {
    const { email, amount, currency, reference, callbackUrl, metadata } = data;

    // Paystack uses smallest unit (kobo for NGN)
    const amountInSmallestUnit = Math.round(amount * 100);

    try {
      const response = await this.client.post("/transaction/initialize", {
        email,
        amount: amountInSmallestUnit,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          ...metadata,
          category: "digital_assets",
          product_type: "digital_asset",
          custom_fields: [
            {
              display_name: "Description",
              variable_name: "description",
              value: "Digital Assets Purchase",
            },
            {
              display_name: "Reference",
              variable_name: "reference",
              value: reference,
            },
          ],
        },
      });

      return {
        checkoutUrl: response.data.data.authorization_url,
        providerReference: response.data.data.reference,
        accessCode: response.data.data.access_code,
      };
    } catch (error) {
      console.error(
        "Paystack Init Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Paystack initialization failed",
      );
    }
  }

  async verify(reference) {
    try {
      const response = await this.client.get(
        `/transaction/verify/${reference}`,
      );
      const { status, amount, currency, reference: ref } = response.data.data;

      return {
        success: status === "success",
        status: status, // success, abandoned, failed
        amount: amount / 100,
        currency: currency,
        reference: ref,
        provider: "paystack",
      };
    } catch (error) {
      console.error(
        "Paystack Verify Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Paystack verification failed",
      );
    }
  }

  verifyWebhookSignature(headers, body, rawBody = null) {
    const signature = headers["x-paystack-signature"];
    if (!signature || !this.secretKey) return false;

    // Use rawBody (Buffer) if available, otherwise fallback to stringified body
    const data = rawBody || JSON.stringify(body);

    const hash = crypto
      .createHmac("sha512", this.secretKey)
      .update(data)
      .digest("hex");

    return hash === signature;
  }

  parseWebhookEvent(payload) {
    const event = payload.event;
    const data = payload.data;

    let status = "pending";
    if (event === "charge.success") status = "success";
    else if (event === "charge.failed") status = "failed";

    let type = (data.metadata?.type === "ad" || data.metadata?.type === "ads")
      ? "AD_PAYMENT"
      : (data.metadata?.type === "subscription"
        ? "SUBSCRIPTION_PAYMENT"
        : "DEPOSIT");

    return {
      type: type,
      display_label: "Digital Assets Purchase",
      reference: data.reference,
      status: status,
      amount: data.amount / 100,
      currency: data.currency,
      userId: data.metadata?.userId || data.metadata?.user_id,
      raw: payload,
    };
  }
}

module.exports = PaystackProvider;
