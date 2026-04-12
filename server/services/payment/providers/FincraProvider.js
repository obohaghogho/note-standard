const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");
const logger = require("../../../utils/logger");

class FincraProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.FINCRA_SECRET_KEY;
    this.publicKey = process.env.FINCRA_PUBLIC_KEY;
    
    // Use FINCRA_ENV if provided, else detect based on key prefix
    const envFlag = (process.env.FINCRA_ENV || "").toLowerCase();
    const isExplicitProd = envFlag === "production" || envFlag === "live";
    const isExplicitSandbox = envFlag === "sandbox" || envFlag === "test";
    
    // Auto-detect test key: sk_test_... or pk_test_...
    const isTestKey = (this.secretKey && this.secretKey.startsWith("sk_test_")) || 
                      (this.publicKey && this.publicKey.startsWith("pk_test_"));

    if (isExplicitProd) {
      this.baseUrl = "https://api.fincra.com";
    } else if (isExplicitSandbox || isTestKey) {
      this.baseUrl = "https://sandboxapi.fincra.com";
    } else {
      // Default to production for safety if no clear indicator
      this.baseUrl = "https://api.fincra.com";
    }
    
    logger.info(`[FincraProvider] Init: ${this.baseUrl} (Detect: ${isTestKey ? 'TEST_KEY' : 'LIVE_KEY'})`);
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30s timeout
      headers: {
        "api-key": (this.secretKey || "").trim(),
        "apikey": (this.secretKey || "").trim(),
        "Authorization": `Bearer ${(this.secretKey || "").trim()}`,
        "x-pub-key": (this.publicKey || "").trim(),
        "x-business-id": (process.env.FINCRA_BUSINESS_ID || "").trim(),
        "Content-Type": "application/json",
        "accept": "application/json",
      },
    });
  }

  async initialize(data) {
    const { email, amount, currency, reference, callbackUrl, metadata, name } = data;

    // Safety checks to prevent 500s from undefined properties
    const safeEmail = email || metadata.email || "user@notestandard.com";
    let safeName = name || metadata.customerName || (safeEmail ? safeEmail.split("@")[0] : "Standard User") || "Standard User";
    
    // Fincra explicitly requires a 'full name' (first and last name separated by space)
    if (!safeName.includes(" ")) {
      safeName = `${safeName} User`;
    }

    try {
      // Fincra API uses standard unit (e.g. 20 for 20 USD), unlike Paystack which uses cents
      const standardAmount = Number(amount || 0);
      
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

      // Fincra returns { data: { link: "https://...", reference: "..." } }
      const respData = response.data?.data || response.data || {};
      const checkoutUrl = respData.link || respData.checkoutUrl || respData.checkout_url || respData.payment_link || null;
      const providerRef = respData.reference || reference;

      return {
        checkoutUrl: checkoutUrl,
        paymentUrl: checkoutUrl,
        providerReference: providerRef,
      };
    } catch (error) {
      const status = error.response?.status || 500;
      const data = error.response?.data || {};
      const message = data.message || data.error || error.message || "Fincra initialization failed";

      console.error(
        "Fincra Init Error:",
        JSON.stringify({
          status,
          data,
          message,
          reference
        }, null, 2)
      );

      // Create an enriched error object
      const enrichedError = new Error(message);
      enrichedError.statusCode = status;
      enrichedError.details = data;
      enrichedError.location = "FincraProvider.initialize";

      // Specific helpful messages for common Fincra errors
      if (status === 401 || status === 403 || message.toLowerCase().includes("unauthorized")) {
        enrichedError.message = "Fincra Authorization Failed. Please check your FINCRA_SECRET_KEY, FINCRA_BUSINESS_ID, and IP Whitelist settings in the Fincra Dashboard.";
        
        if (message.toLowerCase().includes("ip")) {
          enrichedError.message = "IP Whitelist Error: Your server's IP is not allowed to communicate with Fincra. Please whitelist your server's public IP in your Fincra API settings.";
        }
      }

      throw enrichedError;
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
        metadata: response.data.data?.metadata || {},
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
    // Fincra doc: "signature" header. Code also checks "x-fincra-signature" for fallback.
    const signature = headers["signature"] || headers["x-fincra-signature"];
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
    const { currency, email, firstName, lastName, phone, dob, occupation, address, documentUrls } = data;
    
    const isFcy = ["USD", "EUR", "GBP"].includes(currency?.toUpperCase());

    try {
      const payload = {
        currency: currency,
        accountType: "individual",
        KYCInformation: {
          firstName: firstName,
          lastName: lastName,
          email: email,
          phoneNumber: phone,
        },
      };

      // Fincra FCY (USD/EUR/GBP) requires strict detailed KYC
      if (isFcy) {
        payload.KYCInformation = {
          ...payload.KYCInformation,
          birthDate: dob || "1990-01-01", // Placeholder if not provided
          occupation: occupation || "Professional",
          address: {
            street: address?.street || "No 1 Main St",
            city: address?.city || "Lagos",
            state: address?.state || "Lagos State",
            country: address?.country || "NG",
            postalCode: address?.postalCode || "100001"
          },
          // Document URLs required for FCY
          documents: {
            idCard: documentUrls?.idCard || "https://res.cloudinary.com/dummy/id.jpg",
            utilityBill: documentUrls?.utilityBill || "https://res.cloudinary.com/dummy/utility.jpg"
          }
        };
      }

      // Channel is mandatory for some currencies
      if (currency === "NGN") payload.channel = "wema";

      const response = await this.client.post("/profile/virtual-accounts/requests", payload);

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

    let type = (data.metadata?.type === "ad" || data.metadata?.type === "ads")
      ? "AD_PAYMENT"
      : (data.metadata?.type === "subscription"
        ? "SUBSCRIPTION_PAYMENT"
        : "DEPOSIT");

    return {
      type: type,
      display_label: type === "SUBSCRIPTION_PAYMENT" ? "Subscription Upgrade" : "Fincra Payment",
      reference: reference,
      status: status,
      amount: data.amountToSettle || data.amount || data.chargeAmount,
      currency: data.currency,
      userId: data.metadata?.userId || data.metadata?.user_id,
      metadata: data.metadata || {},
      raw: payload,
    };
  }
}

module.exports = FincraProvider;
