const axios = require("axios");
const crypto = require("crypto");
const math = require("../../../utils/mathUtils");
const BaseProvider = require("./BaseProvider");
const logger = require("../../../utils/logger");

/**
 * Anchor BaaS Payment Provider Implementation
 * Standardized provider extending BaseProvider for Anchor Banking-as-a-Service API
 */
class AnchorProvider extends BaseProvider {
  constructor() {
    super();
    this.isEnabled = process.env.ANCHOR_ENABLED === "true";
    this.secretKey = process.env.ANCHOR_SECRET_KEY || "";
    this.webhookSecret = process.env.ANCHOR_WEBHOOK_SECRET || this.secretKey;
    this.env = (process.env.ANCHOR_ENV || "sandbox").toLowerCase();
    
    // Default base URL fallback based on environment
    const defaultUrl = this.env === "production"
      ? "https://api.getanchor.co/api/v1"
      : "https://api.sandbox.getanchor.co/api/v1";
    this.baseUrl = process.env.ANCHOR_BASE_URL || defaultUrl;

    // Strict credential isolation validation
    this.validateEnvironmentCredentials();

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "x-anchor-key": this.secretKey,
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
  }

  /**
   * Enforces strict separation between sandbox and production credentials
   */
  validateEnvironmentCredentials() {
    if (!this.isEnabled) return;

    if (!this.secretKey) {
      logger.warn("[AnchorProvider] ANCHOR_SECRET_KEY is missing. Disabling Anchor provider.");
      this.isEnabled = false;
      return;
    }

    const key = this.secretKey.toLowerCase();
    if (this.env === "production" && (key.includes("_test_") || key.includes("_sandbox_") || key.includes("test"))) {
      logger.error("[AnchorProvider] CRITICAL: Sandbox API key detected in production environment! Disabling Anchor.");
      this.isEnabled = false;
    } else if (this.env === "sandbox" && (key.includes("_live_") || key.includes("_prod_"))) {
      logger.error("[AnchorProvider] CRITICAL: Production API key detected in sandbox environment! Disabling Anchor.");
      this.isEnabled = false;
    }
  }

  assertEnabled() {
    if (!this.isEnabled) {
      throw new Error("[AnchorProvider] Anchor BaaS provider is currently disabled or unconfigured");
    }
  }

  async initialize(data) {
    this.assertEnabled();
    const { email, amount, currency = "NGN", reference, callbackUrl, metadata } = data;
    const { normalizeToSmallestUnit } = require("../../../config/currencyMetadata");

    const upCurrency = String(currency).toUpperCase();
    const amountInUnits = normalizeToSmallestUnit(amount, upCurrency);

    logger.info(`[AnchorProvider] Initializing payment ${amount} ${upCurrency} for ${email} (ref: ${reference})`);

    try {
      const response = await this.client.post("/checkout/initialize", {
        amount: amountInUnits,
        currency: upCurrency,
        reference,
        customerEmail: email,
        callbackUrl,
        meta: metadata || {},
      });

      const resData = response.data?.data || response.data || {};
      return {
        checkoutUrl: resData.checkoutUrl || resData.paymentUrl || resData.url,
        providerReference: resData.id || resData.reference || reference,
        raw: resData,
      };
    } catch (error) {
      logger.error(`[AnchorProvider] Initialization Error: ${error.response?.data?.message || error.message}`);
      throw new Error(error.response?.data?.message || "Anchor payment initialization failed");
    }
  }

  async verify(reference) {
    this.assertEnabled();
    try {
      const response = await this.client.get(`/checkout/verify/${reference}`);
      const data = response.data?.data || response.data || {};
      const status = (data.status || "").toLowerCase();

      return {
        success: status === "successful" || status === "success" || status === "completed",
        status: status === "successful" ? "success" : status,
        amount: data.amount ? data.amount / 100 : 0,
        currency: data.currency || "NGN",
        reference: data.reference || reference,
        provider: "anchor",
        metadata: data.meta || data.metadata || {},
        raw: data,
      };
    } catch (error) {
      logger.error(`[AnchorProvider] Verification Error: ${error.response?.data?.message || error.message}`);
      throw new Error(error.response?.data?.message || "Anchor verification failed");
    }
  }

  /**
   * Cryptographic Webhook Signature Validation (HMAC SHA-256)
   */
  verifyWebhookSignature(headers, body, rawBody = null) {
    if (!this.webhookSecret) {
      logger.warn("[AnchorProvider] Missing ANCHOR_WEBHOOK_SECRET for signature verification");
      return false;
    }

    const signature = headers["x-anchor-signature"] || headers["anchor-signature"] || headers["x-signature"];
    if (!signature) return false;

    const data = rawBody || (typeof body === "string" ? body : JSON.stringify(body));

    try {
      const hash = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(data)
        .digest("hex");

      const computedBuffer = Buffer.from(hash, "utf8");
      const signatureBuffer = Buffer.from(signature, "utf8");

      if (computedBuffer.length !== signatureBuffer.length) return false;
      return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
    } catch (err) {
      logger.error(`[AnchorProvider] Signature Verification Error: ${err.message}`);
      return false;
    }
  }

  /**
   * Parse Anchor Webhook Event into Standardized Payload
   */
  parseWebhookEvent(payload) {
    const event = payload.event || payload.type || "deposit.successful";
    const data = payload.data || payload;

    let status = "pending";
    if (event.includes("success") || event.includes("completed")) {
      status = "success";
    } else if (event.includes("failed") || event.includes("declined")) {
      status = "failed";
    } else if (event.includes("reversed") || event.includes("refunded")) {
      status = "reversed";
    }

    const rawAmount = data.amount || data.settledAmount || 0;
    const { formatFromSmallestUnit } = require("../../../config/currencyMetadata");

    return {
      type: event.startsWith("transfer.") ? "PAYOUT" : "DEPOSIT",
      reference: data.reference || data.paymentReference || data.id,
      transactionId: data.id || data.reference,
      status: status,
      amount: formatFromSmallestUnit(rawAmount, data.currency || "NGN"),
      currency: data.currency || "NGN",
      accountNumber: data.accountNumber || data.account_number,
      customerCode: data.customerId || data.customer_id,
      raw: payload,
    };
  }

  async createVirtualAccount(data) {
    this.assertEnabled();
    const anchorService = require("../../anchorService");
    return await anchorService.createVirtualAccount(data);
  }

  async transfer(data) {
    this.assertEnabled();
    const anchorService = require("../../anchorService");
    return await anchorService.initiateTransfer(data);
  }

  async reverse(reference, reason) {
    this.assertEnabled();
    try {
      const response = await this.client.post(`/transfers/${reference}/reverse`, { reason });
      const resData = response.data?.data || response.data;
      return {
        success: true,
        status: "reversed",
        reference: resData?.reference || reference,
        raw: resData,
      };
    } catch (error) {
      logger.error(`[AnchorProvider] Reverse Error: ${error.response?.data?.message || error.message}`);
      throw new Error(error.response?.data?.message || "Anchor reversal failed");
    }
  }

  async balanceInquiry(currency = "NGN") {
    if (!this.isEnabled) {
      return { balance: 0, currency: currency.toUpperCase() };
    }
    try {
      const response = await this.client.get("/accounts/balance");
      const data = response.data?.data || response.data || {};
      const balance = data.availableBalance || data.balance || 0;
      return {
        balance: balance / 100,
        currency: (data.currency || currency).toUpperCase(),
      };
    } catch (error) {
      logger.warn(`[AnchorProvider] Balance Inquiry Error: ${error.message}`);
      return { balance: 0, currency: currency.toUpperCase() };
    }
  }

  async healthCheck() {
    if (!this.isEnabled) {
      return { status: "disabled", latencyMs: 0, mode: this.env };
    }
    try {
      const start = Date.now();
      await this.client.get("/banks");
      return {
        status: "healthy",
        latencyMs: Date.now() - start,
        mode: this.env,
        authenticated: true,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        latencyMs: 999,
        mode: this.env,
        error: error.message,
      };
    }
  }

  async settlement(data) {
    if (!this.isEnabled) return [];
    try {
      const response = await this.client.get("/settlements", { params: data });
      return response.data?.data || [];
    } catch (error) {
      logger.warn(`[AnchorProvider] Settlement Query Error: ${error.message}`);
      return [];
    }
  }
}

module.exports = AnchorProvider;
