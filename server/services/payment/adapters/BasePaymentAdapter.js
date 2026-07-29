/**
 * BasePaymentAdapter.js
 * =====================
 * Abstract base class for all payment gateway adapters.
 * Every provider MUST implement this interface.
 * Direct gateway SDK calls from business logic are prohibited.
 *
 * Phase 17: Added createTransfer(), reverseTransfer(), balanceInquiry()
 * for unified payout, reversal, and treasury balance operations.
 *
 * NoteStandard Financial Platform v4 / Phase 17
 */

const ConfigService = require('../../ConfigService');
const logger = require('../../../utils/logger');

class BasePaymentAdapter {
  constructor(providerName) {
    if (new.target === BasePaymentAdapter) {
      throw new Error('BasePaymentAdapter is abstract — instantiate a concrete adapter instead.');
    }
    this.providerName = providerName;
  }

  /**
   * Returns the provider name.
   */
  getName() { return this.providerName; }

  /**
   * Retrieves provider-specific configuration via ConfigService.
   * Adapters must NEVER call process.env directly.
   */
  config(key) {
    return ConfigService.get(key);
  }

  /**
   * Initializes a payment and returns a checkout URL or payment reference.
   * @param {Object} params
   * @param {string} params.email
   * @param {number} params.amount           - In processing currency (smallest unit if required)
   * @param {string} params.currency         - Processing currency (gateway currency)
   * @param {string} params.reference        - Our internal reference
   * @param {string} params.callbackUrl
   * @param {Object} [params.metadata]
   * @returns {Promise<{ checkoutUrl: string, providerReference: string }>}
   */
  async initializePayment(params) {
    throw new Error(`[${this.providerName}] initializePayment() not implemented`);
  }

  /**
   * Verifies a payment by reference.
   * @param {string} reference
   * @returns {Promise<{ success: boolean, status: string, amount: number, currency: string, raw: Object }>}
   */
  async verifyPayment(reference) {
    throw new Error(`[${this.providerName}] verifyPayment() not implemented`);
  }

  /**
   * Issues a refund for a previously captured payment.
   * @param {string} reference       - Original payment reference
   * @param {number} amount          - Amount to refund (in processing currency)
   * @param {string} [reason]
   * @returns {Promise<{ success: boolean, refundReference: string }>}
   */
  async refundPayment(reference, amount, reason) {
    throw new Error(`[${this.providerName}] refundPayment() not implemented`);
  }

  /**
   * Creates or retrieves a customer record on the gateway.
   * @param {Object} params
   * @returns {Promise<{ customerId: string }>}
   */
  async createCustomer(params) {
    throw new Error(`[${this.providerName}] createCustomer() not implemented`);
  }

  /**
   * Creates a virtual/dedicated account for a customer.
   * @param {Object} params
   * @returns {Promise<{ bankName: string, accountNumber: string, accountName: string, currency: string }>}
   */
  async createVirtualAccount(params) {
    throw new Error(`[${this.providerName}] createVirtualAccount() not implemented`);
  }

  /**
   * Creates a recurring subscription plan and subscription record.
   * @param {Object} params
   * @returns {Promise<{ subscriptionId: string, status: string }>}
   */
  async createSubscription(params) {
    throw new Error(`[${this.providerName}] createSubscription() not implemented`);
  }

  /**
   * Verifies an incoming webhook signature.
   * @param {Object} headers
   * @param {Buffer|string} rawBody
   * @returns {boolean}
   */
  verifyWebhookSignature(headers, rawBody) {
    throw new Error(`[${this.providerName}] verifyWebhookSignature() not implemented`);
  }

  /**
   * Parses a provider webhook payload into a unified event shape.
   * @param {Object} body
   * @returns {{ type: string, reference: string, status: string, amount: number, currency: string, raw: Object }}
   */
  parseWebhookEvent(body) {
    throw new Error(`[${this.providerName}] parseWebhookEvent() not implemented`);
  }

  /**
   * Health check — returns latency and status.
   * @returns {Promise<{ status: 'HEALTHY'|'DEGRADED'|'DOWN', latencyMs: number }>}
   */
  async healthCheck() {
    throw new Error(`[${this.providerName}] healthCheck() not implemented`);
  }

  /**
   * [Phase 17] Initiate a payout / bank transfer.
   * Used by the FinancialOrchestrator for PAYOUT operations.
   * @param {Object} params
   * @param {number}  params.amount
   * @param {string}  params.currency
   * @param {string}  params.userId
   * @param {string}  params.correlationId
   * @param {string}  [params.bankCode]
   * @param {string}  [params.accountNumber]
   * @param {string}  [params.accountName]
   * @param {string}  [params.narration]
   * @returns {Promise<{ success: boolean, reference: string, providerReference: string }>}
   */
  async createTransfer(params) {
    throw new Error(`[${this.providerName}] createTransfer() not implemented`);
  }

  /**
   * [Phase 17] Reverse / refund a previously executed transfer or payment.
   * @param {string} reference      - Original reference to reverse
   * @param {string} [reason]
   * @returns {Promise<{ success: boolean, reversalReference: string }>}
   */
  async reverseTransfer(reference, reason) {
    throw new Error(`[${this.providerName}] reverseTransfer() not implemented`);
  }

  /**
   * [Phase 17] Retrieve live account balance for a currency.
   * Used by the treasury balance sync and SmartFXRouter.
   * @param {string} currency
   * @returns {Promise<{ available: number, pending: number, currency: string, updatedAt: string }>}
   */
  async balanceInquiry(currency) {
    throw new Error(`[${this.providerName}] balanceInquiry() not implemented`);
  }

  // ─── Shared Utilities ──────────────────────────────────────────────────

  log(msg, level = 'info') {
    logger[level](`[${this.providerName.toUpperCase()}] ${msg}`);
  }
}

module.exports = BasePaymentAdapter;
