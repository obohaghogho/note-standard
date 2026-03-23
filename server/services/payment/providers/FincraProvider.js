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
      timeout: 15000, // 15s timeout
      headers: {
        "api-key": (this.secretKey || "").trim(),
        "x-pub-key": (this.publicKey || "").trim(),
        "x-business-id": (process.env.FINCRA_BUSINESS_ID || "").trim(),
        "Content-Type": "application/json",
      },
    });
  }

  async initialize(data) {
    const { email, amount, currency, reference, callbackUrl, metadata, name } = data;

    // Safety checks to prevent 500s from undefined properties
    const safeEmail = email || metadata.email || "user@notestandard.com";
    const safeName = name || metadata.customerName || (safeEmail ? safeEmail.split("@")[0] : "Standard User") || "Standard User";

    try {
      // Fincra API uses standard unit (e.g. 20 for 20 USD), unlike Paystack which uses cents
      const standardAmount = Number(amount || 0);
      
      console.log(`[Fincra] Initializing payment for ${safeEmail}, amount: ${standardAmount} ${currency}`);
      console.log(`[Fincra] Sending request to ${this.baseUrl}/checkout/payments (Key prefix: ${this.secretKey ? this.secretKey.substring(0, 4) + "..." : "MISSING"})`);
      
      // Fincra Checkout Redirect Flow
      const response = await this.client.post("/checkout/payments", {
        customer: {
          name: safeName,
          email: safeEmail,
        },
        amount: standardAmount,
        currency: currency,
        reference: reference,
        redirectUrl: callbackUrl,
        feeBearer: "business",
        metadata: {
          ...metadata,
          source: "note_standard_backend",
        },
      });

      console.log(`[Fincra] Response status: ${response.status}`);
      console.log(`[Fincra] Response keys:`, Object.keys(response.data || {}));
      if (response.data?.data) {
        console.log(`[Fincra] response.data.data keys:`, Object.keys(response.data.data));
      }

      // Fincra returns { data: { link: "https://...", reference: "..." } }
      const respData = response.data?.data || response.data || {};
      const checkoutUrl = respData.link || respData.checkoutUrl || respData.checkout_url || respData.payment_link || null;
      const providerRef = respData.reference || reference;

      console.log(`[Fincra] Extracted checkoutUrl: ${checkoutUrl}`);

      return {
        checkoutUrl: checkoutUrl,
        paymentUrl: checkoutUrl,
        providerReference: providerRef,
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
      const { status, amount, currency, merchantReference, reference: ref } = response.data.data;

      // Status mapping: Fincra uses 'successful', 'failed', 'pending', 'expired'
      let normalizedStatus = "pending";
      if (status === "success" || status === "successful") normalizedStatus = "success";
      else if (status === "failed") normalizedStatus = "failed";

      console.log(`[Fincra Verify] ${reference} is ${status} -> mapped to ${normalizedStatus}`);

      // Fincra API uses standard unit
      const normalizedAmount = amount ? Number(amount) : 0;

      return {
        success: normalizedStatus === "success",
        status: normalizedStatus, // Must be 'success' or 'failed' for PaymentService
        amount: normalizedAmount,
        currency: currency,
        reference: merchantReference || ref || reference,
        provider: "fincra",
        raw: response.data.data,
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
    
    if (!signature || !webhookSecret) {
      logger.warn("[Fincra] Signature or Webhook Secret missing", { 
        hasSignature: !!signature, 
        hasSecret: !!webhookSecret 
      });
      return false;
    }

    // Use rawBody if available for accurate HMAC verification
    // Fincra often sends exact JSON with specific spacing
    const data = rawBody ||
      (typeof body === "string" ? body : JSON.stringify(body));

    // Fincra primary method is sha512
    const hash512 = crypto
      .createHmac("sha512", webhookSecret)
      .update(data)
      .digest("hex");

    if (hash512 === signature) {
      logger.info("[Fincra] Signature verified (sha512)");
      return true;
    }

    // Fallback: sha256
    const hash256 = crypto
      .createHmac("sha256", webhookSecret)
      .update(data)
      .digest("hex");

    if (hash256 === signature) {
      logger.info("[Fincra] Signature verified (sha256)");
      return true;
    }

    logger.error("[Fincra] Signature mismatch details", {
      received: signature?.substring(0, 10) + "...",
      expected512: hash512?.substring(0, 10) + "...",
      payloadLength: data?.length,
      usingRawBody: !!rawBody,
      secretPrefix: webhookSecret?.substring(0, 4) + "...",
      firstChars: typeof data === 'string' ? data.substring(0, 20) : 'not_string'
    });

    return false;
  }

  /**
   * Request a virtual account for USD/EUR/GBP deposits
   */
  async createVirtualAccount(data) {
    const { currency, email, firstName, lastName, phone } = data;
    try {
      const response = await this.client.post("/profile/virtual-accounts/requests", {
        currency: currency,
        accountType: "individual",
        KYCInformation: {
          firstName: firstName,
          lastName: lastName,
          email: email,
        },
        channel: "wema", // Default for NGN/Others, Fincra handles FCY automatically if enabled
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
    // Fincra webhook payload structure: { event: "charge.successful", data: { ... } }
    const event = payload.event;
    const data = payload.data || {};

    console.log(`[Fincra Webhook] Event: ${event}, Data keys: ${Object.keys(data).join(", ")}`);

    let status = "pending";
    if (data.status === "success" || data.status === "successful" || event === "charge.successful") status = "success";
    else if (data.status === "failed" || event === "charge.failed") status = "failed";

    // Fincra uses merchantReference for OUR reference, chargeReference for their own
    const reference = data.merchantReference || data.reference || data.chargeReference;

    console.log(`[Fincra Webhook] Parsed: status=${status}, reference=${reference}`);

    return {
      type: "DEPOSIT",
      display_label: "Fincra Payment",
      reference: reference,
      status: status,
      amount: data.amountToSettle || data.amount || data.chargeAmount,
      currency: data.currency,
      userId: data.metadata?.userId || data.metadata?.user_id,
      raw: payload,
    };
  }
}

module.exports = FincraProvider;
