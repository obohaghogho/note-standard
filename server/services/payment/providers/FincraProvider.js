const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");

class FincraProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.FINCRA_SECRET_KEY;
    this.publicKey = process.env.FINCRA_PUBLIC_KEY;
    this.baseUrl = "https://api.fincra.com";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "api-key": this.secretKey,
        "Content-Type": "application/json",
      },
    });
  }

  async initialize(data) {
    const { email, amount, currency, reference, callbackUrl, metadata, name } = data;

    try {
      // Fincra Checkout Redirect Flow
      const response = await this.client.post("/checkout/payments", {
        customer: {
          name: name || email.split("@")[0],
          email: email,
        },
        amount: amount,
        currency: currency,
        reference: reference,
        redirectUrl: callbackUrl,
        feeBearer: "customer", // Default to customer bearing fee, can be customized
        metadata: {
          ...metadata,
          source: "note_standard_backend",
        },
      });

      // Fincra returns checkoutUrl and transaction reference
      return {
        checkoutUrl: response.data.data.checkoutUrl,
        providerReference: response.data.data.reference,
      };
    } catch (error) {
      console.error(
        "Fincra Init Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Fincra initialization failed",
      );
    }
  }

  async verify(reference) {
    try {
      // Fincra Verify Payment by Reference
      const response = await this.client.get(`/checkout/payments/merchant-reference/${reference}`);
      const { status, amount, currency, reference: ref } = response.data.data;

      // Status mapping: Fincra uses 'success', 'failed', 'pending'
      return {
        success: status === "success",
        status: status,
        amount: amount,
        currency: currency,
        reference: ref,
        provider: "fincra",
      };
    } catch (error) {
      console.error(
        "Fincra Verify Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Fincra verification failed",
      );
    }
  }

  verifyWebhookSignature(headers, body, rawBody = null) {
    const signature = headers["x-fincra-signature"];
    const webhookSecret = process.env.FINCRA_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) return false;

    // Use rawBody if available for accurate HMAC verification
    const data = rawBody ||
      (typeof body === "string" ? body : JSON.stringify(body));

    const hash = crypto
      .createHmac("sha512", webhookSecret)
      .update(data)
      .digest("hex");

    return hash === signature;
  }

  parseWebhookEvent(payload) {
    // Fincra webhook payload structure: { event: "charge.success", data: { ... } }
    const event = payload.event;
    const data = payload.data;

    let status = "pending";
    if (data.status === "success" || event === "charge.success") status = "success";
    else if (data.status === "failed" || event === "charge.failed") status = "failed";

    return {
      type: "DEPOSIT",
      display_label: "Fincra Payment",
      reference: data.reference,
      status: status,
      amount: data.amount,
      currency: data.currency,
      userId: data.metadata?.userId || data.metadata?.user_id,
      raw: payload,
    };
  }
}

module.exports = FincraProvider;
