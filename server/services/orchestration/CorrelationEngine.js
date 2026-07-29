'use strict';
/**
 * CorrelationEngine.js
 * ====================
 * Generates and tracks NS-TXN-YYYY-NNNNNN cross-provider correlation IDs.
 *
 * A correlation ID is the single immutable identifier linking:
 *   - Payment execution log entry
 *   - Ledger entries (both sides of double-entry)
 *   - Provider reference(s) across failover hops
 *   - Settlement position record
 *   - All webhook events
 *   - Treasury audit log entries
 *
 * Format: NS-{TYPE}-{YEAR}-{SEQUENCE}
 *   TYPE: TXN (transaction) | PAY (payment) | PYT (payout) | SWP (swap) | RFD (refund)
 *   YEAR: 4-digit year
 *   SEQUENCE: 6-digit zero-padded (DB sequence: ns_txn_seq)
 *
 * @module services/orchestration/CorrelationEngine
 */

const supabase  = require('../../config/database');
const logger    = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Prefix map per operation type
const TYPE_PREFIXES = {
  DEPOSIT:    'DEP',
  WITHDRAWAL: 'WTH',
  PAYOUT:     'PYT',
  SWAP:       'SWP',
  REFUND:     'RFD',
  TRANSFER:   'TRF',
  DEFAULT:    'TXN',
};

const CorrelationEngine = {
  /**
   * Create a new correlation ID and write the initial execution log entry.
   *
   * @param {Object} params
   * @param {string} params.operationType  - DEPOSIT | WITHDRAWAL | PAYOUT | SWAP | REFUND
   * @param {string} params.userId
   * @param {string} params.currency
   * @param {number} params.amount
   * @param {string} [params.idempotencyKey]
   * @param {Object} [params.metadata]
   * @returns {Promise<{ correlationId: string, executionLogId: string }>}
   */
  async create({ operationType, userId, currency, amount, idempotencyKey, metadata = {} }) {
    const typePrefix = TYPE_PREFIXES[String(operationType).toUpperCase()] || TYPE_PREFIXES.DEFAULT;
    const year       = new Date().getFullYear();

    try {
      // DB INSERT with default correlation_id (uses ns_txn_seq sequence)
      const { data, error } = await supabase
        .from('payment_execution_log')
        .insert({
          operation_type:   operationType,
          user_id:          userId,
          currency:         String(currency).toUpperCase(),
          amount:           parseFloat(amount),
          idempotency_key:  idempotencyKey || null,
          execution_state:  'INITIATED',
          ledger_state:     'PENDING',
          metadata,
        })
        .select('id, correlation_id')
        .single();

      if (error) throw error;

      // Override the default TXN prefix with type-specific prefix if different
      if (typePrefix !== 'TXN') {
        const newId = data.correlation_id.replace('NS-TXN-', `NS-${typePrefix}-`);
        await supabase
          .from('payment_execution_log')
          .update({ correlation_id: newId })
          .eq('id', data.id);
        data.correlation_id = newId;
      }

      logger.info(`[CorrelationEngine] Created ${data.correlation_id} for ${operationType} ${amount} ${currency}`);
      return { correlationId: data.correlation_id, executionLogId: data.id };

    } catch (err) {
      // Fallback: generate in-memory if DB is unavailable (never block the payment)
      const fallbackId = `NS-${typePrefix}-${year}-${String(Date.now()).slice(-6)}`;
      logger.warn(`[CorrelationEngine] DB write failed, using fallback ID ${fallbackId}: ${err.message}`);
      return { correlationId: fallbackId, executionLogId: null };
    }
  },

  /**
   * Check idempotency — returns existing execution if key already processed.
   */
  async checkIdempotency(idempotencyKey) {
    if (!idempotencyKey) return null;
    const { data } = await supabase
      .from('payment_execution_log')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    return data || null;
  },

  /**
   * Advance the execution state of a correlation log entry.
   */
  async advanceState(executionLogId, newState, updates = {}) {
    if (!executionLogId) return;
    await supabase
      .from('payment_execution_log')
      .update({ execution_state: newState, updated_at: new Date().toISOString(), ...updates })
      .eq('id', executionLogId)
      .catch(e => logger.warn(`[CorrelationEngine] advanceState failed: ${e.message}`));
  },

  /**
   * Mark execution as completed.
   */
  async complete(executionLogId, { providerReference, selectedProvider, ledgerState = 'COMMITTED' } = {}) {
    if (!executionLogId) return;
    await supabase
      .from('payment_execution_log')
      .update({
        execution_state:   'COMPLETED',
        ledger_state:      ledgerState,
        provider_reference: providerReference || null,
        selected_provider:  selectedProvider || null,
        completed_at:       new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', executionLogId)
      .catch(e => logger.warn(`[CorrelationEngine] complete failed: ${e.message}`));
  },

  /**
   * Mark execution as failed.
   */
  async fail(executionLogId, { errorCode, errorMessage, failoverCount = 0 } = {}) {
    if (!executionLogId) return;
    await supabase
      .from('payment_execution_log')
      .update({
        execution_state: 'FAILED',
        error_code:      errorCode || 'UNKNOWN',
        error_message:   errorMessage || 'Unknown error',
        failover_count:  failoverCount,
        completed_at:    new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      })
      .eq('id', executionLogId)
      .catch(e => logger.warn(`[CorrelationEngine] fail failed: ${e.message}`));
  },

  /**
   * Link a provider reference to a correlation ID.
   * Called after each provider attempt (including failover hops).
   */
  async linkProviderRef(executionLogId, providerKey, providerReference, result = 'SUCCESS') {
    if (!executionLogId) return;
    const { data: existing } = await supabase
      .from('payment_execution_log')
      .select('provider_history, failover_count')
      .eq('id', executionLogId)
      .single()
      .catch(() => ({ data: null }));

    const history = existing?.provider_history || [];
    history.push({ provider: providerKey, reference: providerReference, result, timestamp: new Date().toISOString() });

    await supabase
      .from('payment_execution_log')
      .update({
        provider_history:   history,
        selected_provider:  providerKey,
        provider_reference: providerReference,
        failover_count:     result === 'FAILOVER' ? (existing?.failover_count || 0) + 1 : existing?.failover_count || 0,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', executionLogId)
      .catch(e => logger.warn(`[CorrelationEngine] linkProviderRef failed: ${e.message}`));
  },

  /**
   * Lookup a correlation ID by idempotency key or execution log ID.
   */
  async lookup(correlationId) {
    const { data } = await supabase
      .from('payment_execution_log')
      .select('*')
      .eq('correlation_id', correlationId)
      .maybeSingle();
    return data || null;
  },
};

module.exports = CorrelationEngine;
