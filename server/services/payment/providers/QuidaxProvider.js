const BaseProvider = require("./BaseProvider");
const quidaxService = require("../../quidaxService");
const env = require("../../../config/env");

/**
 * Quidax Payment & Custody Provider Adapter
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements standard BaseProvider interface for Quidax integration.
 * Fails closed when Quidax is disabled or unconfigured in environment.
 */
class QuidaxProvider extends BaseProvider {
  constructor() {
    super();
    this.name = "quidax";
    this.providerName = "quidax";
  }

  /**
   * Check capability availability.
   */
  isAvailable() {
    return quidaxService.isConfigured();
  }

  /**
   * Initialize a payment or deposit transaction.
   */
  async initialize(data) {
    if (!this.isAvailable()) {
      throw new Error("QUIDAX_PROVIDER_DISABLED: Quidax provider is not enabled or credentials are missing.");
    }
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: Quidax payment initialization is blocked pending official API documentation.");
  }

  /**
   * Verify transaction status with Quidax API.
   */
  async verify(reference) {
    if (!this.isAvailable()) {
      throw new Error("QUIDAX_PROVIDER_DISABLED: Quidax provider is not enabled or credentials are missing.");
    }
    return await quidaxService.getTransactionStatus(reference);
  }

  /**
   * Verify webhook signature.
   */
  verifyWebhookSignature(headers, body) {
    if (!env.QUIDAX_WEBHOOK_SECRET) {
      throw new Error("QUIDAX_WEBHOOK_NOT_CONFIGURED: Quidax webhook secret is missing.");
    }
    const signature = headers["x-quidax-signature"] || headers["x-quidax-sig"];
    return quidaxService.verifyWebhookSignature(body, signature);
  }

  /**
   * Parse webhook payload into standardized event structure.
   */
  parseWebhookEvent(payload) {
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: Quidax webhook event parsing is blocked pending official API documentation.");
  }
}

module.exports = QuidaxProvider;
