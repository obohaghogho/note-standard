const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");

class FincraProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.FINCRA_SECRET_KEY;
    this.publicKey = process.env.FINCRA_PUBLIC_KEY;
    
    // Dynamically set baseUrl based on key pattern (test vs live)
    const isTest = (this.secretKey && (this.secretKey.startsWith("sk_test_") || this.secretKey.startsWith("pk_test_"))) ||
                   (this.publicKey && this.publicKey.startsWith("pk_test_"));
    
    this.baseUrl = isTest ? "https://sandboxapi.fincra.com" : "https://api.fincra.com";
    
    console.log(`[FincraProvider] Environment: ${isTest ? 'SANDBOX' : 'PRODUCTION'} (${this.baseUrl})`);
    
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
      // Fincra uses smallest unit (cents for USD, kobo for NGN)
      const amountInSmallestUnit = Math.round(amount * 100);
      
      console.log(`[Fincra] Initializing payment for ${email}, amount: ${amount} ${currency} (Smallest Unit: ${amountInSmallestUnit})`);
      console.log(`[Fincra] Sending request to ${this.baseUrl}/checkout/payments`);
      console.log(`[Fincra] Headers: ${JSON.stringify({ ...this.client.defaults.headers, "api-key": this.secretKey ? this.secretKey.substring(0, 8) + "..." : "MISSING" })}`);
      
      // Fincra Checkout Redirect Flow
      const response = await this.client.post("/checkout/payments", {
        customer: {
          name: name || email.split("@")[0],
          email: email,
        },
        amount: amountInSmallestUnit,
        currency: currency,
        reference: reference,
        redirectUrl: callbackUrl,
        feeBearer: "customer", // Default to customer bearing fee, can be customized
        metadata: {
          ...metadata,
          source: "note_standard_backend",
        },
      });

      console.log(`[Fincra] Response success: ${response.status}`);

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

    // User Instruction: Use sha256 for Fincra
    const hash256 = crypto
      .createHmac("sha256", webhookSecret)
      .update(data)
      .digest("hex");

    if (hash256 === signature) return true;

    // Fallback: Some Fincra events might still use sha512 depending on the API version/product
    const hash512 = crypto
      .createHmac("sha512", webhookSecret)
      .update(data)
      .digest("hex");

    return hash512 === signature;
  }

  /**
   * Request a virtual account for USD/EUR/GBP deposits
   */
  async createVirtualAccount(data) {
    const { currency, email, firstName, lastName, phone } = data;
    try {
      const response = await this.client.post("/virtual-accounts/individual", {
        currency: currency,
        accountType: "individual",
        customer: {
          name: `${firstName} ${lastName}`,
          email: email,
          phoneNumber: phone,
        },
        channel: currency === "NGN" ? "vanso" : "wema", // Just examples, Fincra API varies
      });

      return {
        bankName: response.data.data.bankName,
        accountNumber: response.data.data.accountNumber,
        accountName: response.data.data.accountName,
        currency: response.data.data.currency,
        reference: response.data.data.reference,
        provider: "fincra",
      };
    } catch (error) {
      console.error(
        "Fincra Virtual Account Error:",
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      throw new Error(
        error.response?.data?.message || error.response?.data?.error || "Failed to generate virtual account",
      );
    }
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
