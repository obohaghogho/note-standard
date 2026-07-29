'use strict';
/**
 * TransactionLifecycle.js
 * =======================
 * Canonical transaction state machine for the NoteStandard Financial Platform.
 * Defines the authoritative lifecycle shared by all providers and flow types.
 *
 * States:
 *   CREATED           - Record inserted, no provider contact yet
 *   VALIDATED         - Idempotency + compliance checks passed
 *   POLICY_APPROVED   - Payment policy engine approved
 *   ROUTED            - Provider selected by RoutingEngine
 *   PROVIDER_ACCEPTED - Provider confirmed receipt
 *   PENDING_SETTLEMENT- Awaiting provider settlement
 *   SETTLED           - Funds confirmed settled
 *
 * Terminal (failure) states:
 *   FAILED            - Provider returned failure
 *   REVERSED          - Reversal/refund completed
 *   EXPIRED           - TTL exceeded before completion
 *   CANCELLED         - Explicitly cancelled by admin or system
 *
 * @module services/orchestration/TransactionLifecycle
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// ─── State Definitions ───────────────────────────────────────────────────────

const STATES = Object.freeze({
  CREATED:             'CREATED',
  VALIDATED:           'VALIDATED',
  POLICY_APPROVED:     'POLICY_APPROVED',
  ROUTED:              'ROUTED',
  PROVIDER_ACCEPTED:   'PROVIDER_ACCEPTED',
  PENDING_SETTLEMENT:  'PENDING_SETTLEMENT',
  SETTLED:             'SETTLED',
  FAILED:              'FAILED',
  REVERSED:            'REVERSED',
  EXPIRED:             'EXPIRED',
  CANCELLED:           'CANCELLED',
});

// Allowed forward transitions (from → [valid targets])
const TRANSITIONS = {
  CREATED:            ['VALIDATED', 'FAILED', 'CANCELLED'],
  VALIDATED:          ['POLICY_APPROVED', 'FAILED', 'CANCELLED'],
  POLICY_APPROVED:    ['ROUTED', 'FAILED', 'CANCELLED'],
  ROUTED:             ['PROVIDER_ACCEPTED', 'FAILED', 'CANCELLED'],
  PROVIDER_ACCEPTED:  ['PENDING_SETTLEMENT', 'FAILED'],
  PENDING_SETTLEMENT: ['SETTLED', 'FAILED', 'REVERSED', 'EXPIRED'],
  SETTLED:            ['REVERSED'],          // Reversal after settlement
  FAILED:             ['REVERSED'],          // Retry path — reversal
  // Terminal states — no further transitions
  REVERSED:           [],
  EXPIRED:            [],
  CANCELLED:          [],
};

// Terminal states — no further transitions allowed
const TERMINAL_STATES = new Set(['SETTLED', 'REVERSED', 'EXPIRED', 'CANCELLED']);

// ─── State Machine ────────────────────────────────────────────────────────────

const TransactionLifecycle = {
  STATES,
  TERMINAL_STATES,

  /**
   * Check if a state transition is valid.
   * @param {string} from
   * @param {string} to
   * @returns {boolean}
   */
  isValidTransition(from, to) {
    const allowed = TRANSITIONS[from] || [];
    return allowed.includes(to);
  },

  /**
   * Apply a state transition to a transaction in the DB.
   * Guards against invalid transitions.
   *
   * @param {string} correlationId
   * @param {string} toState
   * @param {Object} [metadata]   Extra context to merge into metadata
   * @returns {Promise<{ success: boolean, previousState: string, newState: string }>}
   */
  async transition(correlationId, toState, metadata = {}) {
    // Fetch current state
    const { data: tx, error: fetchErr } = await supabase
      .from('payment_executions')
      .select('status, correlation_id, metadata')
      .eq('correlation_id', correlationId)
      .maybeSingle();

    if (fetchErr || !tx) {
      logger.error(`[TransactionLifecycle] Cannot transition: ${correlationId} not found`);
      return { success: false, error: 'Transaction not found', correlationId };
    }

    const from = tx.status;

    // Allow no-op (idempotent re-application of same state)
    if (from === toState) {
      return { success: true, previousState: from, newState: toState, noOp: true };
    }

    if (!this.isValidTransition(from, toState)) {
      logger.warn(`[TransactionLifecycle] Invalid transition: ${from} → ${toState} for ${correlationId}`);
      return { success: false, error: `Invalid transition: ${from} → ${toState}`, previousState: from };
    }

    const updatedMeta = {
      ...(tx.metadata || {}),
      ...metadata,
      [`transition_${toState.toLowerCase()}_at`]: new Date().toISOString(),
      previous_state: from,
    };

    const { error: updateErr } = await supabase
      .from('payment_executions')
      .update({ status: toState, metadata: updatedMeta, updated_at: new Date().toISOString() })
      .eq('correlation_id', correlationId);

    if (updateErr) {
      logger.error(`[TransactionLifecycle] DB update failed for ${correlationId}: ${updateErr.message}`);
      return { success: false, error: updateErr.message };
    }

    logger.info(`[TransactionLifecycle] ${correlationId}: ${from} → ${toState}`);
    return { success: true, previousState: from, newState: toState, correlationId };
  },

  /**
   * Check if a transaction is in a terminal state.
   */
  async isTerminal(correlationId) {
    const { data } = await supabase
      .from('payment_executions')
      .select('status')
      .eq('correlation_id', correlationId)
      .maybeSingle();
    return data ? TERMINAL_STATES.has(data.status) : false;
  },

  /**
   * Mark a transaction as EXPIRED (runs as a scheduled cleanup).
   * Only affects transactions stuck in non-terminal states beyond TTL.
   *
   * @param {number} ttlHours   Max hours a transaction may remain non-terminal
   */
  async expireStale(ttlHours = 24) {
    const cutoff = new Date(Date.now() - ttlHours * 3600 * 1000).toISOString();

    const { data: stale } = await supabase
      .from('payment_executions')
      .select('correlation_id, status')
      .in('status', ['CREATED', 'VALIDATED', 'POLICY_APPROVED', 'ROUTED'])
      .lt('created_at', cutoff);

    const results = [];
    for (const tx of (stale || [])) {
      const r = await this.transition(tx.correlation_id, 'EXPIRED', {
        expiry_reason: `Stale after ${ttlHours}h TTL`,
      });
      results.push(r);
    }

    logger.info(`[TransactionLifecycle] Expired ${results.filter(r => r.success).length}/${(stale || []).length} stale transactions`);
    return results;
  },

  /**
   * Returns allowed next states from current state.
   */
  getAllowedTransitions(currentState) {
    return TRANSITIONS[currentState] || [];
  },
};

module.exports = TransactionLifecycle;
