const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");

class KorapayProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.KORAPAY_SECRET_KEY;
    this.publicKey = process.env.KORAPAY_PUBLIC_KEY;
    this.baseUrl = "https://api.korapay.com/merchant/api/v1";
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

    try {
      const response = await this.client.post("/charges/initialize", {
        reference: reference,
        amount: amount,
        currency: currency,
        customer: {
          email: email,
        },
        notification_url: callbackUrl,
        redirect_url: callbackUrl,
        description: "Digital Assets Purchase",
        metadata: {
          ...metadata,
          category: "digital_assets",
          product_type: "digital_asset",
        },
      });

      return {
        checkoutUrl: response.data.data.checkout_url,
        providerReference: response.data.data.reference,
      };
    } catch (error) {
      console.error(
        "Korapay Init Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Korapay initialization failed",
      );
    }
  }

  async verify(reference) {
    try {
      const response = await this.client.get(`/charges/${reference}`);
      const { status, amount, currency, reference: ref } = response.data.data;

      return {
        success: status === "success",
        status: status,
        amount: amount,
        currency: currency,
        reference: ref,
        provider: "korapay",
      };
    } catch (error) {
      console.error(
        "Korapay Verify Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Korapay verification failed",
      );
    }
  }

  verifyWebhookSignature(headers, body, rawBody = null) {
    const signature = headers["x-korapay-signature"];
    const webhookSecret = process.env.KORAPAY_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) return false;

    // Use rawBody if available
    const data = rawBody ||
      (typeof body === "string" ? body : JSON.stringify(body));

    const hash = crypto
      .createHmac("sha256", webhookSecret)
      .update(data)
      .digest("hex");

    return hash === signature;
  }

  parseWebhookEvent(payload) {
    const event = payload.event;
    const data = payload.data;

    let status = "pending";
    if (data.status === "success") status = "success";
    else if (data.status === "failed") status = "failed";

    return {
      type: "DEPOSIT",
      display_label: "Digital Assets Purchase",
      reference: data.reference,
      status: status,
      amount: data.amount,
      currency: data.currency,
      userId: data.metadata?.userId || data.metadata?.user_id,
      raw: payload,
    };
  }
}

module.exports = KorapayProvider;
