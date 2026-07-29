'use strict';
/**
 * UnifiedBankingInterface.js
 * ==========================
 * Abstract base class defining the full contract for every banking provider.
 * Every provider (Fincra, Anchor, Paystack, Grey, NOWPayments, future providers)
 * MUST implement this interface to participate in routing, failover, treasury,
 * reconciliation, and the FinancialOrchestrator pipeline.
 *
 * Adding a new provider = implement this interface + register in BankingProviderRegistry.
 * No other files need to change.
 *
 * @module services/banking/UnifiedBankingInterface
 */

const logger = require('../../utils/logger');

class UnifiedBankingInterface {
  constructor(providerKey) {
    if (new.target === UnifiedBankingInterface) {
      throw new Error('UnifiedBankingInterface is abstract. Implement a concrete provider.');
    }
    this.providerKey = providerKey;
    this._name = providerKey.toUpperCase();
  }

  // ── Identity ─────────────────────────────────────────────────────────────────
  getProviderKey()  { return this.providerKey; }
  getDisplayName()  { throw new Error(`${this._name}: getDisplayName() not implemented`); }
  isEnabled()       { throw new Error(`${this._name}: isEnabled() not implemented`); }

  // ── Payments ──────────────────────────────────────────────────────────────────
  /**
   * Create a payment intent / checkout session.
   * @returns {Promise<{ checkoutUrl, providerReference }>}
   */
  async initialize(params) {
    throw new Error(`${this._name}: initialize() not implemented`);
  }

  /**
   * Verify a payment by reference.
   * @returns {Promise<{ success, status, amount, currency, raw }>}
   */
  async verifyPayment(reference) {
    throw new Error(`${this._name}: verifyPayment() not implemented`);
  }

  // ── Accounts ──────────────────────────────────────────────────────────────────
  /**
   * Provision a virtual/dedicated account for a customer.
   * @returns {Promise<{ bankName, accountNumber, accountName, currency, provider }>}
   */
  async createVirtualAccount(params) {
    throw new Error(`${this._name}: createVirtualAccount() not implemented`);
  }

  /**
   * Resolve an account number to a name via NIP/ACH lookup.
   * @returns {Promise<{ accountName, accountNumber, bankCode }>}
   */
  async verifyAccount(accountNumber, bankCode) {
    throw new Error(`${this._name}: verifyAccount() not implemented`);
  }

  // ── Transfers ─────────────────────────────────────────────────────────────────
  /**
   * Execute a domestic or international payout.
   * @returns {Promise<{ success, status, reference, raw }>}
   */
  async createTransfer(params) {
    throw new Error(`${this._name}: createTransfer() not implemented`);
  }

  /**
   * Reverse / recall a transfer.
   * @returns {Promise<{ success, status, reference }>}
   */
  async reverseTransfer(reference, reason) {
    throw new Error(`${this._name}: reverseTransfer() not implemented`);
  }

  // ── Balance ───────────────────────────────────────────────────────────────────
  /**
   * Retrieve available balance for a currency.
   * @returns {Promise<{ available, pending, currency, provider, syncedAt }>}
   */
  async getBalance(currency) {
    throw new Error(`${this._name}: getBalance() not implemented`);
  }

  /**
   * Retrieve all balances (multi-currency).
   * @returns {Promise<Array<{ available, pending, currency, provider }>>}
   */
  async getAllBalances() {
    throw new Error(`${this._name}: getAllBalances() not implemented`);
  }

  // ── Transactions ──────────────────────────────────────────────────────────────
  /**
   * Retrieve transaction history from the provider.
   * @returns {Promise<Array<{ id, type, amount, currency, status, createdAt }>>}
   */
  async getTransactions(filters = {}) {
    throw new Error(`${this._name}: getTransactions() not implemented`);
  }

  // ── Health ────────────────────────────────────────────────────────────────────
  /**
   * Live health check.
   * @returns {Promise<{ score: 0-100, status: string, latencyMs: number, circuitState: string }>}
   */
  async healthCheck() {
    throw new Error(`${this._name}: healthCheck() not implemented`);
  }

  /**
   * Provider SLA metrics.
   * @returns {Promise<{ uptime_pct, avg_latency_ms, success_rate_1h, error_budget_pct }>}
   */
  async getSLAMetrics() {
    throw new Error(`${this._name}: getSLAMetrics() not implemented`);
  }

  // ── Cost ──────────────────────────────────────────────────────────────────────
  /**
   * Return fee estimate for a given operation + amount.
   * Used by RoutingEngine for cost scoring.
   * @returns {{ fee_amount: number, fee_pct: number, currency: string }}
   */
  getCostFor(operationType, amount, currency) {
    throw new Error(`${this._name}: getCostFor() not implemented`);
  }

  // ── Reconciliation ────────────────────────────────────────────────────────────
  /**
   * Fetch provider transactions for a date range for reconciliation.
   * @returns {Promise<Array<{ ref, type, amount, currency, status, date }>>}
   */
  async reconcile(dateFrom, dateTo) {
    throw new Error(`${this._name}: reconcile() not implemented`);
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────────
  /**
   * Process an inbound webhook event.
   * @returns {Promise<{ type, reference, status, amount, currency, raw }>}
   */
  async processWebhook(event, rawBody, headers) {
    throw new Error(`${this._name}: processWebhook() not implemented`);
  }

  /**
   * Verify incoming webhook signature.
   * @returns {boolean}
   */
  verifyWebhookSignature(headers, rawBody) {
    throw new Error(`${this._name}: verifyWebhookSignature() not implemented`);
  }

  // ── Capability Queries ────────────────────────────────────────────────────────
  /**
   * @returns {boolean}
   */
  supportsCurrency(currency) {
    throw new Error(`${this._name}: supportsCurrency() not implemented`);
  }

  /**
   * @returns {boolean}
   */
  supportsMethod(method) {
    throw new Error(`${this._name}: supportsMethod() not implemented`);
  }

  /**
   * @returns {boolean}
   */
  supportsOperation(operationType, currency = 'ANY') {
    throw new Error(`${this._name}: supportsOperation() not implemented`);
  }

  // ── Shared Utilities ──────────────────────────────────────────────────────────
  _log(msg, level = 'info') {
    logger[level](`[${this._name}] ${msg}`);
  }

  _notSupported(operation) {
    this._log(`${operation} is not supported by this provider`, 'warn');
    return { success: false, reason: 'NOT_SUPPORTED', provider: this.providerKey };
  }
}

module.exports = UnifiedBankingInterface;
