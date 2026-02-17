const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");

class FlutterwaveProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    this.baseUrl = "https://api.flutterwave.com/v3";
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
      const response = await this.client.post("/payments", {
        tx_ref: reference,
        amount: amount,
        currency: currency,
        redirect_url: callbackUrl,
        customer: {
          email: email,
        },
        meta: {
          ...metadata,
          category: "digital_assets",
          product_type: "digital_asset",
        },
        customizations: {
          title: "Digital Assets Purchase",
          description: "Digital Assets Purchase",
          logo: "https://notestandard.com/logo.png",
        },
      });

      return {
        checkoutUrl: response.data.data.link,
        providerReference: response.data.data.id,
      };
    } catch (error) {
      console.error(
        "Flutterwave Init Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Flutterwave initialization failed",
      );
    }
  }

  async verify(reference) {
    try {
      // Flutterwave can verify by tx_ref (our ref) or ID
      const response = await this.client.get(
        `/transactions/verify_by_reference?tx_ref=${reference}`,
      );
      const { status, amount, currency, tx_ref } = response.data.data;

      return {
        success: status === "successful",
        status: status,
        amount: amount,
        currency: currency,
        reference: tx_ref,
        provider: "flutterwave",
      };
    } catch (error) {
      console.error(
        "Flutterwave Verify Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Flutterwave verification failed",
      );
    }
  }

  verifyWebhookSignature(headers, body, rawBody = null) {
    const signature = headers["verif-hash"];
    const secretHash = process.env.FLW_SECRET_HASH ||
      process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    return signature && secretHash && signature === secretHash;
  }

  parseWebhookEvent(payload) {
    const event = payload.event || (payload["event.type"]);
    const data = payload.data || payload;

    let status = "pending";
    if (data.status === "successful") status = "success";
    else if (data.status === "failed") status = "failed";

    return {
      type: (data.meta?.product_type === "digital_asset" ||
          data.metadata?.product_type === "digital_asset")
        ? "Digital Assets Purchase"
        : event,
      display_label: "Digital Assets Purchase",
      reference: data.tx_ref || data.reference,
      status: status,
      amount: data.amount,
      currency: data.currency,
      userId: data.meta?.userId || data.meta?.user_id ||
        (data.metadata ? data.metadata.userId : null),
      raw: payload,
    };
  }
}

module.exports = FlutterwaveProvider;
