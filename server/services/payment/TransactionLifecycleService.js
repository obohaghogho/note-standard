'use strict';

/**
 * TransactionLifecycleService.js
 * ==============================
 * Service enforcing explicit transaction state machine transitions,
 * optimistic version locking, and audit state history logging.
 */
class TransactionLifecycleService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    this.inMemoryTransactions = new Map();
    this.inMemoryHistory = [];
  }

  /**
   * Legal Transition Matrix
   */
  get LEGAL_TRANSITIONS() {
    return {
      CREATED: ['AUTHORIZED', 'PENDING', 'CANCELLED', 'EXPIRED'],
      AUTHORIZED: ['PENDING', 'CANCELLED', 'EXPIRED'],
      PENDING: ['PROCESSING', 'FAILED', 'CANCELLED', 'EXPIRED'],
      PROCESSING: ['SUCCEEDED', 'FAILED', 'POSTING_FAILED', 'REVERSED'],
      SUCCEEDED: ['POSTED', 'POSTING_FAILED', 'REVERSED'],
      POSTING_FAILED: ['POSTED', 'FAILED'],
      POSTED: ['SETTLED', 'REVERSED', 'REFUNDED'],
      SETTLED: ['RECONCILED'],
      RECONCILED: ['ARCHIVED'],
      // Terminal states
      FAILED: [],
      CANCELLED: [],
      EXPIRED: [],
      REVERSED: [],
      REFUNDED: [],
      ARCHIVED: []
    };
  }

  /**
   * Create a new transaction record
   */
  async createTransaction(txData) {
    const { intentId, sessionId, userId, providerReference, provider, currency, amount } = txData;
    if (!userId) throw new Error('userId is required');
    if (!currency) throw new Error('currency is required');
    if (!amount || amount <= 0) throw new Error('amount must be positive');

    const txRecord = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      intent_id: intentId || null,
      session_id: sessionId || null,
      user_id: userId,
      provider_reference: providerReference || null,
      provider: provider || 'fincra',
      currency: currency.toUpperCase(),
      amount: parseFloat(amount),
      status: 'CREATED',
      version: 1,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `INSERT INTO public.transactions 
           (intent_id, session_id, user_id, provider_reference, provider, currency, amount, status, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATED', 1)
           RETURNING *`,
          [txRecord.intent_id, txRecord.session_id, txRecord.user_id, txRecord.provider_reference, txRecord.provider, txRecord.currency, txRecord.amount]
        );
        if (res.rows && res.rows.length > 0) {
          txRecord.id = res.rows[0].id;
        }
      } catch (err) {
        // Fallback to in-memory store
      }
    }

    this.inMemoryTransactions.set(txRecord.id, txRecord);
    await this.logStateHistory(txRecord.id, 'NONE', 'CREATED', 'SYSTEM', 'Initial creation', txData);
    return txRecord;
  }

  /**
   * Transition transaction state with legal checks and optimistic locking
   */
  async transitionState(txId, targetState, meta = {}) {
    const tx = this.inMemoryTransactions.get(txId) || { id: txId, status: meta.currentStatus || 'PENDING', version: 1 };
    const currentState = tx.status;

    // 1. Legal state transition check
    const allowed = this.LEGAL_TRANSITIONS[currentState] || [];
    if (!allowed.includes(targetState) && currentState !== targetState) {
      throw new Error(`ILLEGAL_STATE_TRANSITION: Cannot transition transaction '${txId}' from '${currentState}' to '${targetState}'`);
    }

    // 2. Optimistic locking increment
    const previousVersion = tx.version || 1;
    tx.status = targetState;
    tx.version = previousVersion + 1;
    tx.updated_at = new Date();

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `UPDATE public.transactions 
           SET status = $1, version = version + 1, updated_at = NOW()
           WHERE id = $2 AND version = $3
           RETURNING *`,
          [targetState, txId, previousVersion]
        );
        if (res.rowCount === 0) {
          throw new Error(`OPTIMISTIC_LOCK_FAILURE: Transaction '${txId}' was modified concurrently.`);
        }
      } catch (err) {
        if (err.message.includes('OPTIMISTIC_LOCK_FAILURE')) throw err;
      }
    }

    // 3. Log audit history
    await this.logStateHistory(txId, currentState, targetState, meta.actor || 'SYSTEM', meta.reason || 'State transition', meta);
    return tx;
  }

  /**
   * Log transaction state audit history entry
   */
  async logStateHistory(txId, fromState, toState, actor, reason, meta = {}) {
    const historyEntry = {
      id: `txh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      transaction_id: txId,
      from_state: fromState,
      to_state: toState,
      actor,
      reason,
      occurred_at: new Date(),
      correlation_id: meta.correlationId || meta.correlation_id || null,
      trace_id: meta.traceId || meta.trace_id || null,
      provider_reference: meta.providerReference || meta.provider_reference || null
    };

    this.inMemoryHistory.push(historyEntry);

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `INSERT INTO public.transaction_state_history
           (transaction_id, from_state, to_state, actor, reason, correlation_id, trace_id, provider_reference)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [historyEntry.transaction_id, historyEntry.from_state, historyEntry.to_state, historyEntry.actor, historyEntry.reason, historyEntry.correlation_id, historyEntry.trace_id, historyEntry.provider_reference]
        );
      } catch (err) {
        // Fallback
      }
    }

    return historyEntry;
  }
}

module.exports = TransactionLifecycleService;
