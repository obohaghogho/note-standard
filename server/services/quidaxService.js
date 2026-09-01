/**
 * Quidax Crypto Provider Service Interface (Phase 3A Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Architectural boundary for Quidax crypto deposit, custody, and liquidation integration.
 *
 * SAFETY INVARIANTS:
 *   1. Fail-Closed on Unconfirmed Documentation: Throws explicit `QUIDAX_DOCUMENTATION_REQUIRED`
 *      errors for unconfirmed methods rather than returning fake mock data.
 *   2. Server-Only Secrets: Quidax keys are accessed strictly server-side via `server/config/env.js`.
 *   3. Authoritative Ledger Sovereignty: External Quidax states NEVER directly mutate user balances
 *      without passing through NoteStandard's atomic double-entry PostgreSQL RPCs.
 */

'use strict';

const logger = require("../utils/logger");
const env = require("../config/env");

class QuidaxService {
  constructor() {
    this.providerName = "quidax";
  }

  /**
   * Helper to verify if Quidax is explicitly enabled and configured in environment.
   */
  isConfigured() {
    return Boolean(env.QUIDAX_ENABLED && env.QUIDAX_SECRET_KEY);
  }

  /**
   * Ensure provider is enabled before attempting any operation.
   */
  _assertEnabled() {
    if (!env.QUIDAX_ENABLED) {
      throw new Error("QUIDAX_PROVIDER_DISABLED: Quidax is currently disabled. Set QUIDAX_ENABLED=true in environment.");
    }
    if (!env.QUIDAX_SECRET_KEY) {
      throw new Error("QUIDAX_NOT_CONFIGURED: Quidax API secret key is missing in server environment.");
    }
  }

  /**
   * Get or generate a Quidax crypto deposit address.
   * Blocked pending official Quidax sub-account / wallet API documentation.
   */
  async getDepositAddress(userId, asset, network, supabase) {
    this._assertEnabled();
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: getDepositAddress is blocked pending official Quidax sub-account/wallet API documentation.");
  }

  /**
   * Fetch Quidax external account / hot wallet balance for proof of reserves.
   * Blocked pending official Quidax balance query API documentation.
   */
  async getProviderBalance(asset) {
    this._assertEnabled();
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: getProviderBalance is blocked pending official Quidax balance query API documentation.");
  }

  /**
   * Fetch a guaranteed liquidation quote (Crypto -> Fiat).
   * Blocked pending official Quidax ticker/quote API documentation.
   */
  async getQuote(fromAsset, toCurrency, amount) {
    this._assertEnabled();
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: getQuote is blocked pending official Quidax quote API documentation.");
  }

  /**
   * Execute an instant crypto sell / liquidation trade against Quidax.
   * Blocked pending official Quidax trade execution API documentation.
   */
  async executeLiquidation(quoteId, idempotencyKey) {
    this._assertEnabled();
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: executeLiquidation is blocked pending official Quidax trade execution API documentation.");
  }

  /**
   * Retrieve external status of a transaction / trade by ID.
   * Blocked pending official Quidax transaction status API documentation.
   */
  async getTransactionStatus(txId) {
    this._assertEnabled();
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: getTransactionStatus is blocked pending official Quidax status API documentation.");
  }

  /**
   * Verify HMAC signature of an incoming Quidax webhook callback.
   * Blocked pending official Quidax webhook signature specification.
   */
  verifyWebhookSignature(payload, signature) {
    if (!env.QUIDAX_WEBHOOK_SECRET) {
      throw new Error("QUIDAX_WEBHOOK_NOT_CONFIGURED: Quidax webhook secret is missing in server environment.");
    }
    throw new Error("QUIDAX_DOCUMENTATION_REQUIRED: verifyWebhookSignature is blocked pending official Quidax webhook signature specification.");
  }
}

module.exports = new QuidaxService();
