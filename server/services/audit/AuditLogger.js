/**
 * AuditLogger.js
 * ==============
 * Immutable financial audit trail for every money movement.
 * Records who, what, when, which gateway, and outcome.
 *
 * NoteStandard Financial Platform v4
 */

const supabase = require('../../config/database');
const logger = require('../../utils/logger');

class AuditLogger {
  /**
   * Records an immutable audit event.
   *
   * @param {Object} entry
   * @param {string} entry.action            - e.g. 'payment.initialized', 'refund.issued', 'wallet.credited'
   * @param {string} [entry.userId]          - Initiating user ID
   * @param {string} [entry.service]         - Service that processed the action
   * @param {string} [entry.provider]        - Gateway used (paystack, fincra, etc.)
   * @param {string} [entry.reference]       - Internal transaction reference
   * @param {string} [entry.providerRef]     - Provider-side reference ID
   * @param {string} [entry.requestedCurrency]
   * @param {number} [entry.requestedAmount]
   * @param {string} [entry.gatewayCurrency]
   * @param {number} [entry.gatewayAmount]
   * @param {number} [entry.exchangeRate]
   * @param {string} [entry.outcome]         - 'SUCCESS' | 'FAILURE' | 'PENDING' | 'FLAGGED'
   * @param {string} [entry.failureReason]
   * @param {Object} [entry.metadata]        - Any additional context
   */
  async log(entry) {
    const payload = {
      action:              entry.action,
      user_id:             entry.userId     || null,
      service:             entry.service    || 'unknown',
      provider:            entry.provider   || null,
      reference:           entry.reference  || null,
      provider_ref:        entry.providerRef || null,
      requested_currency:  entry.requestedCurrency || null,
      requested_amount:    entry.requestedAmount   ?? null,
      gateway_currency:    entry.gatewayCurrency   || null,
      gateway_amount:      entry.gatewayAmount      ?? null,
      exchange_rate:       entry.exchangeRate        ?? null,
      outcome:             entry.outcome    || 'PENDING',
      failure_reason:      entry.failureReason || null,
      metadata:            entry.metadata   || {},
      created_at:          new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('financial_audit_log')
        .insert(payload);

      if (error) {
        // Audit log failure is critical — log to console at minimum
        logger.error(`[AuditLogger] DB write failed: ${error.message}`, { action: entry.action, reference: entry.reference });
      }
    } catch (err) {
      logger.error(`[AuditLogger] Unexpected error: ${err.message}`);
    }

    // Always emit to application logger for real-time monitoring
    logger.info(`[AUDIT] ${payload.action} | ref=${payload.reference} | provider=${payload.provider} | outcome=${payload.outcome}`);
  }

  /**
   * Shorthand for a successful financial action.
   */
  async success(entry) {
    return this.log({ ...entry, outcome: 'SUCCESS' });
  }

  /**
   * Shorthand for a failed financial action.
   */
  async failure(entry) {
    return this.log({ ...entry, outcome: 'FAILURE' });
  }

  /**
   * Shorthand for a flagged/risk-reviewed action.
   */
  async flagged(entry) {
    return this.log({ ...entry, outcome: 'FLAGGED' });
  }
}

module.exports = new AuditLogger();
