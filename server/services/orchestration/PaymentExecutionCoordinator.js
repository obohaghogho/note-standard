'use strict';
/**
 * PaymentExecutionCoordinator.js
 * ==============================
 * Multi-provider idempotency and execution guard.
 * Every payment, payout, swap, and refund passes through this service
 * BEFORE reaching any provider, preventing duplicate execution during
 * retries or failover hops.
 *
 * Contract:
 *   const { allowed, existingResult, coordinationId } = await PEC.guard(key, fn);
 *   if (!allowed) return existingResult;
 *
 * @module services/orchestration/PaymentExecutionCoordinator
 */

'use strict';

const logger           = require('../../utils/logger');
const supabase         = require('../../config/database');
const CorrelationEngine = require('./CorrelationEngine');

// In-process lock set — prevents concurrent duplicate execution within the same server instance
const _inFlightKeys = new Set();

const PaymentExecutionCoordinator = {
  /**
   * Guard a payment execution against duplicate processing.
   *
   * @param {string}   idempotencyKey   - Caller-provided unique key for this operation
   * @param {string}   operationType    - DEPOSIT | PAYOUT | SWAP | REFUND
   * @param {Object}   context          - { userId, currency, amount, metadata }
   * @param {Function} fn               - Async executor to call if not duplicate
   * @returns {Promise<{ allowed: boolean, result: any, correlationId: string, wasDuplicate: boolean }>}
   */
  async guard(idempotencyKey, operationType, context, fn) {
    const { userId, currency, amount, metadata = {} } = context;

    // ── 1. DB idempotency check ──────────────────────────────────────────────
    const existingEntry = await CorrelationEngine.checkIdempotency(idempotencyKey);

    if (existingEntry) {
      const state = existingEntry.execution_state;

      if (state === 'COMPLETED') {
        logger.info(`[PEC] Duplicate suppressed — ${idempotencyKey} already COMPLETED (${existingEntry.correlation_id})`);
        return {
          allowed:       false,
          wasDuplicate:  true,
          correlationId: existingEntry.correlation_id,
          executionLogId: existingEntry.id,
          result:        { alreadyProcessed: true, correlationId: existingEntry.correlation_id },
        };
      }

      if (state === 'INITIATED' || state === 'ROUTING' || state === 'PROVIDER_EXECUTING') {
        // Currently in-flight on another request — reject with conflict
        logger.warn(`[PEC] Concurrent duplicate detected — ${idempotencyKey} is ${state}`);
        return {
          allowed:       false,
          wasDuplicate:  true,
          correlationId: existingEntry.correlation_id,
          executionLogId: existingEntry.id,
          result:        { alreadyProcessed: false, inFlight: true, correlationId: existingEntry.correlation_id },
        };
      }

      // FAILED — allow retry
      if (state === 'FAILED') {
        logger.info(`[PEC] Retrying previously failed execution: ${existingEntry.correlation_id}`);
        await supabase
          .from('payment_execution_log')
          .update({ execution_state: 'INITIATED', retry_count: (existingEntry.retry_count || 0) + 1, last_retry_at: new Date().toISOString() })
          .eq('id', existingEntry.id);
      }
    }

    // ── 2. In-process lock ───────────────────────────────────────────────────
    if (_inFlightKeys.has(idempotencyKey)) {
      logger.warn(`[PEC] In-process duplicate suppressed: ${idempotencyKey}`);
      return { allowed: false, wasDuplicate: true, correlationId: null, result: { inFlight: true } };
    }
    _inFlightKeys.add(idempotencyKey);

    // ── 3. Create correlation entry ───────────────────────────────────────────
    let correlationId, executionLogId;
    if (existingEntry) {
      correlationId  = existingEntry.correlation_id;
      executionLogId = existingEntry.id;
    } else {
      ({ correlationId, executionLogId } = await CorrelationEngine.create({
        operationType, userId, currency, amount, idempotencyKey, metadata,
      }));
    }

    // ── 4. Execute ────────────────────────────────────────────────────────────
    try {
      const result = await fn({ correlationId, executionLogId });
      return { allowed: true, wasDuplicate: false, correlationId, executionLogId, result };
    } finally {
      _inFlightKeys.delete(idempotencyKey);
    }
  },

  /**
   * Check if an idempotency key has already been processed successfully.
   */
  async isCompleted(idempotencyKey) {
    const entry = await CorrelationEngine.checkIdempotency(idempotencyKey);
    return entry?.execution_state === 'COMPLETED';
  },

  /**
   * Generate a deterministic idempotency key from operation parameters.
   * Safe to call multiple times — same inputs produce the same key.
   */
  buildKey(operationType, userId, amount, currency, suffix = '') {
    const base = `${operationType}:${userId}:${amount}:${currency}:${suffix}`;
    const { createHash } = require('crypto');
    return `ns_${createHash('sha256').update(base).digest('hex').slice(0, 24)}`;
  },

  /**
   * List recently failed executions eligible for replay.
   */
  async getPendingReplay(limit = 50) {
    const { data } = await supabase
      .from('payment_execution_log')
      .select('*')
      .eq('execution_state', 'FAILED')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  },
};

module.exports = PaymentExecutionCoordinator;
