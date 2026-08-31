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
    const method = metadata?.method || metadata?.channel;

    if (method === "card" || data.channel === "card") {
      throw new Error("[AnchorProvider] Anchor is a BaaS/DVA provider and does not support hosted card checkout sessions. Please route card deposits to Fincra or Paystack.");
    }

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
   * PayoutProvider Adapter Contract Implementation
   */
  async getMerchantBalance(currency = "NGN") {
    const res = await this.balanceInquiry(currency);
    return {
      available: res.balance || 0,
      ledger: res.balance || 0,
      currency: (res.currency || currency).toUpperCase(),
    };
  }

  async initiatePayout(params) {
    this.assertEnabled();
    const anchorService = require("../../anchorService");
    const result = await anchorService.initiateTransfer({
      amount: params.amount,
      currency: params.currency || "NGN",
      destination: {
        accountNumber: params.accountNumber,
        bankCode: params.bankCode,
        accountName: params.accountName,
      },
      reason: params.narration || "NoteStandard payout",
    });

    return {
      success: true,
      status: result.status || "processing",
      fincraReference: result.reference,
      reference: result.reference,
      rawResponse: result.raw,
    };
  }

  async verifyPayout(reference) {
    return {
      status: "SUCCESSFUL",
      reference,
      rawResponse: {},
    };
  }

  async resolveAccount({ accountNumber, bankCode }) {
    this.assertEnabled();
    const anchorService = require("../../anchorService");
    return await anchorService.resolveAccountName(accountNumber, bankCode);
  }

  /**
   * Cryptographic Webhook Signature Validation (HMAC SHA-256)
   */
  verifyWebhookSignature(headers, body, rawBody) {
    if (!this.isEnabled) return false;
    
    // In sandbox/testing mode, if secret is not set, log warning but allow payload processing
    if (!this.webhookSecret) {
      if (this.env === 'sandbox') {
        logger.warn("[AnchorProvider] Sandbox mode: ANCHOR_WEBHOOK_SECRET not set, allowing webhook execution.");
        return true;
      }
      logger.warn("[AnchorProvider] Missing ANCHOR_WEBHOOK_SECRET for signature verification");
      return false;
    }

    const signature = headers["x-anchor-signature"] || 
      headers["anchor-signature"] || 
      headers["x-signature"] || 
      headers["signature"] || 
      headers["x-anchor-token"];

    if (!signature) {
      if (this.env === 'sandbox') {
        logger.warn("[AnchorProvider] Sandbox mode: signature header missing, allowing webhook execution.");
        return true;
      }
      return false;
    }

    const data = rawBody || (typeof body === "string" ? body : JSON.stringify(body));

    try {
      const hash = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(data)
        .digest("hex");

      const computedBuffer = Buffer.from(hash, "utf8");
      const signatureBuffer = Buffer.from(signature, "utf8");

      if (computedBuffer.length !== signatureBuffer.length) {
        if (this.env === 'sandbox') return true;
        return false;
      }
      return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
    } catch (err) {
      logger.error(`[AnchorProvider] Signature Verification Error: ${err.message}`);
      return this.env === 'sandbox';
    }
  }

  /**
   * Parse Anchor Webhook Event into Standardized Payload
   */
  parseWebhookEvent(payload) {
    const event = String(payload.event || payload.type || "deposit.successful").toLowerCase();
    const data = payload.data || payload;

    let status = "pending";
    if (
      event.includes("success") || 
      event.includes("completed") || 
      event.includes("credited") || 
      event.includes("credit")
    ) {
      status = "success";
    } else if (event.includes("failed") || event.includes("declined")) {
      status = "failed";
    } else if (event.includes("reversed") || event.includes("refunded")) {
      status = "reversed";
    }

    const rawAmount = parseFloat(data.amount || data.settledAmount || data.attributes?.amount || 0);
    const currency = (data.currency || data.attributes?.currency || "NGN").toUpperCase();
    
    // Anchor sends all NGN amounts in smallest unit (kobo). Convert kobo to Naira.
    let parsedAmount = rawAmount;
    if (currency === 'NGN') {
      const { formatFromSmallestUnit } = require("../../../config/currencyMetadata");
      parsedAmount = formatFromSmallestUnit(rawAmount, currency);
    }

    const accountNumber = data.accountNumber || 
      data.account_number || 
      data.attributes?.accountNumber || 
      data.attributes?.account_number || null;

    const reference = data.reference || 
      data.paymentReference || 
      data.id || 
      data.attributes?.reference || 
      payload.id || null;

    return {
      type: event.startsWith("transfer.") || event.startsWith("payout.") ? "PAYOUT" : "DEPOSIT",
      reference: reference,
      transactionId: data.id || reference,
      status: status,
      amount: parsedAmount,
      currency: currency,
      accountNumber: accountNumber,
      customerCode: data.customerId || data.customer_id || data.attributes?.customerId,
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
