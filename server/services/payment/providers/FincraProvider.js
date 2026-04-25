const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");
const logger = require("../../../utils/logger");

/**
 * FincraProvider — Production-Grade Checkout & Webhook Integration
 *
 * Architecture:
 *  - initialize()  → Creates a Fincra checkout session and returns a validated checkoutUrl
 *  - verify()      → Polls Fincra API to confirm payment status by merchantReference
 *  - verifyWebhookSignature() → HMAC-validates incoming Fincra webhooks
 *  - parseWebhookEvent()     → Normalizes raw Fincra payload into our unified event schema
 *
 * Environment:
 *  - FINCRA_ENV=sandbox → sandboxapi.fincra.com
 *  - FINCRA_ENV=live    → api.fincra.com
 *
 * Fincra Sandbox Card Activation:
 *  Card collection must be manually enabled at https://app.fincra.com (toggle to Sandbox)
 *  Settings → Collections → Enable "Card". Without this, checkout pages show an error.
 */

class FincraProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey   = (process.env.FINCRA_SECRET_KEY   || "").trim();
    this.publicKey   = (process.env.FINCRA_PUBLIC_KEY   || "").trim();
    this.businessId  = (process.env.FINCRA_BUSINESS_ID  || "").trim();
    this.webhookSecret = (process.env.FINCRA_WEBHOOK_SECRET || "").trim();

    let rawEnv = (process.env.FINCRA_ENV || "sandbox").toLowerCase().trim();
    const envFlag = rawEnv || "sandbox";

    if (envFlag === "production" || envFlag === "live") {
      this.baseUrl = "https://api.fincra.com";
      this.isSandbox = false;
    } else if (envFlag === "sandbox" || envFlag === "test") {
      this.baseUrl = "https://sandboxapi.fincra.com";
      this.isSandbox = true;
    } else {
      const configError = `[Fincra] CRITICAL CONFIG ERROR: Invalid FINCRA_ENV ("${envFlag}"). Must be 'live' or 'sandbox'.`;
      logger.error(configError);
      throw new Error(configError);
    }

    logger.info(`[Fincra] Initialized — ENV: ${envFlag.toUpperCase()}, BaseURL: ${this.baseUrl}`);

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        "api-key":       this.secretKey,
        "x-pub-key":     this.publicKey,
        "x-business-id": this.businessId,
        "Content-Type":  "application/json",
        "accept":        "application/json",
      },
      maxRedirects: 0,
    });

    // Axios interceptors for unified logging
    this.client.interceptors.request.use((config) => {
      logger.info(`[Fincra] → ${config.method?.toUpperCase()} ${config.url}`, {
        body: config.data ? JSON.stringify(config.data).substring(0, 500) : "none",
      });
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.info(`[Fincra] ← ${response.status} ${response.config.url}`, {
          data: JSON.stringify(response.data).substring(0, 500),
        });
        return response;
      },
      (error) => {
        logger.error(`[Fincra] ← ERROR ${error.response?.status || "NO_RESPONSE"} ${error.config?.url}`, {
          errorData: JSON.stringify(error.response?.data || error.message).substring(0, 500),
        });
        return Promise.reject(error);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECKOUT INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(data) {
    const { email, amount, currency, reference, callbackUrl, metadata, name } = data;

    if (!email || !amount || !currency || !reference || !callbackUrl) {
      throw new Error("[Fincra] initialize() called with missing required fields: email, amount, currency, reference, callbackUrl");
    }

    // Fincra requires full name (First Last)
    const safeEmail = (email || "").trim();
    let safeName    = (name || metadata?.customerName || safeEmail.split("@")[0] || "Standard User").trim();
    if (!safeName.includes(" ")) safeName = `${safeName} User`;

    // Build safe metadata — all values must be strings for Fincra compatibility
    const safeMetadata = {
      userId:        String(metadata?.userId        || ""),
      transactionId: String(metadata?.transactionId || ""),
      type:          String(metadata?.type          || "DEPOSIT"),
      method:        String(metadata?.method        || "card"),
      source:        "note_standard_v2",
    };

    const payload = {
      customer: {
        name:  safeName,
        email: safeEmail,
      },
      amount:         Math.floor(amount),
      currency:       String(currency).toUpperCase(),
      reference:      String(reference),
      redirectUrl:    String(callbackUrl),
      paymentMethods: ["card"],
      metadata:       safeMetadata,
    };

    logger.info(`[Fincra] Creating checkout session`, {
      reference,
      amount,
      currency: payload.currency,
      email: safeEmail,
      redirectUrl: callbackUrl,
      sandbox: this.isSandbox,
    });

    try {
      const response = await this.client.post("/checkout/payments", payload);

      const respData   = response.data?.data || response.data || {};
      // Fincra returns the link as 'link' field in data
      const checkoutUrl = respData.link || respData.checkoutUrl || respData.checkout_url || respData.payment_link;

      // ── STRICT VALIDATION: Reject if no checkout URL ──────────────────
      if (!checkoutUrl) {
        logger.error("[Fincra] API returned 200 but checkout URL is missing", {
          reference,
          fullResponse: JSON.stringify(response.data),
        });
        const missingUrlError = new Error(
          `[Fincra] Checkout URL missing from API response for reference ${reference}. ` +
          `Full response: ${JSON.stringify(response.data)}`
        );
        missingUrlError.statusCode = 502;
        missingUrlError.fincraResponse = response.data;
        throw missingUrlError;
      }

      logger.info(`[Fincra] ✅ Checkout session created`, {
        reference,
        checkoutUrl,
        payCode:   respData.payCode   || respData.reference,
        providerRef: respData.reference || reference,
      });

      return {
        success:           true,
        checkoutUrl:       checkoutUrl,
        providerReference: respData.reference || reference,
        payCode:           respData.payCode   || null,
      };

    } catch (error) {
      // Re-throw if already our structured error
      if (error.fincraResponse) throw error;

      const status    = error.response?.status || 500;
      const errorData = error.response?.data   || {};
      const message   = errorData.message || errorData.error || error.message || "Fincra initialization failed";

      logger.error(`[Fincra] ❌ Checkout creation failed`, {
        reference,
        status,
        message,
        currency,
        amount,
        errorData: JSON.stringify(errorData),
      });

      const structuredError        = new Error(message);
      structuredError.success      = false;
      structuredError.statusCode   = status;
      structuredError.fincra       = { status, response: errorData };
      structuredError.details      = errorData;
      throw structuredError;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENT VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  async verify(reference) {
    logger.info(`[Fincra] Verifying payment`, { reference });

    try {
      const response = await this.client.get(
        `/checkout/payments/merchant-reference/${reference}`
      );

      const d = response.data?.data || {};
      const rawStatus = d.status;

      // Normalize Fincra status to our internal status contract
      let normalizedStatus = "pending";
      if (["success", "successful", "paid"].includes(rawStatus)) {
        normalizedStatus = "success";
      } else if (["failed", "cancelled", "canceled"].includes(rawStatus)) {
        normalizedStatus = "failed";
      } else if (rawStatus === "expired") {
        normalizedStatus = "failed"; // treat expired as failed
      }

      logger.info(`[Fincra] Verification result`, {
        reference,
        rawStatus,
        normalizedStatus,
        amount:   d.amount,
        currency: d.currency,
      });

      return {
        success:   normalizedStatus === "success",
        status:    normalizedStatus,
        amount:    d.amount      ? Number(d.amount)       : 0,
        currency:  d.currency    || null,
        reference: d.merchantReference || d.reference || reference,
        provider:  "fincra",
        metadata:  d.metadata    || {},
        raw:       d,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Fincra verification failed";
      logger.error(`[Fincra] Verification error`, { reference, error: msg });
      throw new Error(msg);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WEBHOOK SIGNATURE VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  verifyWebhookSignature(headers, body, rawBody = null) {
    const signature    = headers["signature"] || headers["x-fincra-signature"] || headers["x-webhook-signature"];
    const webhookSecret = this.webhookSecret || process.env.FINCRA_WEBHOOK_SECRET;

    // ── Sandbox bypass: In sandbox with no secret configured, log and allow ──
    if (this.isSandbox && !webhookSecret) {
      logger.warn("[Fincra] Sandbox mode — FINCRA_WEBHOOK_SECRET not set. Bypassing signature check. SET THIS FOR PRODUCTION.");
      return true;
    }

    if (!signature) {
      logger.warn("[Fincra] No signature header in webhook request", {
        availableHeaders: Object.keys(headers).join(", "),
      });
      // In sandbox, allow through without signature to ease testing
      if (this.isSandbox) {
        logger.warn("[Fincra] Sandbox: accepting webhook without signature header.");
        return true;
      }
      return false;
    }

    if (!webhookSecret) {
      logger.error("[Fincra] FINCRA_WEBHOOK_SECRET is not configured — all webhooks will be rejected.");
      return false;
    }

    // Use rawBody if available (most accurate for HMAC)
    const dataToHash = rawBody
      ? (Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody))
      : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));

    // Try SHA-512 (Fincra primary)
    const hash512 = crypto.createHmac("sha512", webhookSecret).update(dataToHash).digest("hex");
    if (hash512 === signature) {
      logger.info("[Fincra] ✅ Webhook signature verified (sha512)");
      return true;
    }

    // Try SHA-256 (fallback)
    const hash256 = crypto.createHmac("sha256", webhookSecret).update(dataToHash).digest("hex");
    if (hash256 === signature) {
      logger.info("[Fincra] ✅ Webhook signature verified (sha256)");
      return true;
    }

    logger.error("[Fincra] ❌ Webhook signature MISMATCH", {
      receivedSig:    signature?.substring(0, 16) + "...",
      expected512:    hash512?.substring(0, 16) + "...",
      secretPrefix:   webhookSecret?.substring(0, 6) + "...",
      bodyLength:     dataToHash.length,
      usingRawBody:   !!rawBody,
    });

    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WEBHOOK PAYLOAD NORMALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  parseWebhookEvent(payload) {
    const event = payload.event || payload.type || "";
    const data  = payload.data || {};

    logger.info(`[Fincra] Parsing webhook event`, {
      event,
      dataKeys:    Object.keys(data).join(", "),
      reference:   data.merchantReference || data.reference,
      rawStatus:   data.status,
    });

    // ── Status Mapping ──────────────────────────────────────────────────────
    let status = "pending";
    const rawStatus = (data.status || "").toLowerCase();
    const isSuccess = rawStatus === "success" || rawStatus === "successful" || rawStatus === "paid";
    const isFailed  = rawStatus === "failed"  || rawStatus === "cancelled"  || rawStatus === "canceled";

    if (isSuccess || event === "charge.successful" || event === "checkout.paid") {
      status = "success";
    } else if (isFailed || event === "charge.failed" || event === "checkout.failed") {
      status = "failed";
    }

    // ── Reference Extraction ────────────────────────────────────────────────
    // Fincra sends merchantReference (our reference) and reference (their payCode)
    const ourReference      = data.merchantReference || data.reference || null;
    const providerReference = data.chargeReference   || data.reference || null;

    if (!ourReference) {
      logger.error("[Fincra] Webhook missing merchantReference — cannot match transaction!", {
        event,
        dataKeys: Object.keys(data).join(", "),
      });
    }

    // ── Transaction Type from Metadata ──────────────────────────────────────
    const metaType = (data.metadata?.type || "DEPOSIT").toUpperCase();
    let type = "DEPOSIT";
    if (metaType === "AD_PAYMENT" || metaType === "ADS") {
      type = "AD_PAYMENT";
    } else if (metaType === "SUBSCRIPTION" || metaType === "SUBSCRIPTION_PAYMENT") {
      type = "SUBSCRIPTION_PAYMENT";
    }

    // ── Amount Normalization ────────────────────────────────────────────────
    const amount = Number(data.amountToSettle || data.amount || data.chargeAmount || 0);

    logger.info(`[Fincra] ✅ Webhook parsed`, {
      type,
      status,
      ourReference,
      providerReference,
      amount,
      currency: data.currency,
      userId:   data.metadata?.userId,
    });

    return {
      type,
      display_label:     type === "SUBSCRIPTION_PAYMENT" ? "Subscription Upgrade" : "Fincra Card Payment",
      reference:         ourReference,
      providerReference: providerReference,
      status,
      amount,
      currency:   data.currency  || null,
      userId:     data.metadata?.userId || data.metadata?.user_id || null,
      metadata:   data.metadata  || {},
      raw:        payload,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VIRTUAL ACCOUNT (USD/EUR/GBP bank transfers)
  // ─────────────────────────────────────────────────────────────────────────

  async createVirtualAccount(data) {
    const { currency, email, firstName, lastName, phone, dob, occupation, address, documentUrls } = data;
    const isFcy = ["USD", "EUR", "GBP"].includes((currency || "").toUpperCase());

    const payload = {
      currency,
      accountType:    "individual",
      KYCInformation: {
        firstName,
        lastName,
        email,
        phoneNumber: phone,
      },
      business: this.businessId,
    };

    if (isFcy) {
      Object.assign(payload.KYCInformation, {
        birthDate:  dob          || "1990-01-01",
        occupation: occupation   || "Professional",
        address: {
          street:     address?.street     || "No 1 Main St",
          city:       address?.city       || "Lagos",
          state:      address?.state      || "Lagos State",
          country:    address?.country    || "NG",
          postalCode: address?.postalCode || "100001",
        },
        documents: {
          idCard:      documentUrls?.idCard,
          utilityBill: documentUrls?.utilityBill,
        },
      });

      if (!payload.KYCInformation.documents.idCard || !payload.KYCInformation.documents.utilityBill) {
        const err = new Error("MISSING_KYC_DOCUMENTS: USD/EUR/GBP accounts require ID card and Utility Bill URLs.");
        err.statusCode = 400;
        throw err;
      }
    }

    if (currency === "NGN") payload.channel = "wema";

    try {
      const response = await this.client.post("/profile/virtual-accounts/requests", payload);
      const d = response.data.data;
      return {
        bankName:      d.bankName,
        accountNumber: d.accountNumber,
        accountName:   d.accountName,
        currency:      d.currency,
        reference:     d.reference,
        provider:      "fincra",
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || "Failed to generate virtual account";
      logger.error("[Fincra] Virtual Account Error", { currency, error: msg });
      throw new Error(msg);
    }
  }
}

module.exports = FincraProvider;
