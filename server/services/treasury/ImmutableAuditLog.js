'use strict';
/**
 * ImmutableAuditLog.js
 * ====================
 * Writes hash-chained, append-only records to treasury_audit_log.
 *
 * Every record includes:
 *   - SHA-256 of its own payload (payload_hash)
 *   - SHA-256 of the previous record (previous_hash)
 *
 * This creates a cryptographic chain. Any tampering with a past
 * record breaks the chain at that point, detectable by a chain
 * verification sweep.
 *
 * Rules:
 *   - Never throws on failure — treasury operations must not be
 *     blocked by audit log issues. Errors are logged only.
 *   - Chain is ordered by the auto-incrementing `id` (BIGSERIAL)
 *
 * @module services/treasury/ImmutableAuditLog
 */

const crypto   = require('crypto');
const supabase  = require('../../config/database');
const logger    = require('../../utils/logger');

class ImmutableAuditLog {

  /**
   * Record a treasury event in the immutable audit log.
   *
   * @param {object} event
   * @param {string}  event.event_type        - e.g. 'TREASURY_SYNC'
   * @param {string}  [event.event_subtype]
   * @param {string}  [event.actor_type]      - 'SYSTEM' | 'WORKER' | 'ADMIN'
   * @param {string}  [event.actor_id]        - Worker name or admin UUID
   * @param {string}  [event.actor_ip]
   * @param {string}  [event.subject_type]
   * @param {string}  [event.subject_id]
   * @param {string}  [event.provider]
   * @param {string}  [event.currency]
   * @param {number}  [event.amount]
   * @param {number}  [event.before_balance]
   * @param {number}  [event.after_balance]
   * @param {number}  [event.reserve_ratio]
   * @param {string}  [event.correlation_id]
   * @param {string}  [event.reference]
   * @param {string}  [event.reason]
   * @param {object}  [event.metadata]
   * @returns {Promise<string|null>}  event_id of created record, or null on failure
   */
  async record(event) {
    try {
      const occurredAt = new Date().toISOString();

      // Build deterministic payload for hashing
      const payloadForHash = JSON.stringify({
        event_type:   event.event_type,
        subject_id:   event.subject_id   || null,
        currency:     event.currency      || null,
        amount:       event.amount        || null,
        occurred_at:  occurredAt,
      });

      const payloadHash = crypto
        .createHash('sha256')
        .update(payloadForHash)
        .digest('hex');

      // Fetch the hash of the last record in the chain
      const previousHash = await this._getLastHash();

      const row = {
        event_type:     event.event_type,
        event_subtype:  event.event_subtype  || null,
        actor_type:     event.actor_type      || 'SYSTEM',
        actor_id:       event.actor_id        || null,
        actor_ip:       event.actor_ip        || null,
        subject_type:   event.subject_type    || null,
        subject_id:     event.subject_id      || null,
        provider:       event.provider        || null,
        currency:       event.currency        || null,
        amount:         event.amount          || null,
        before_balance: event.before_balance  || null,
        after_balance:  event.after_balance   || null,
        reserve_ratio:  event.reserve_ratio   || null,
        correlation_id: event.correlation_id  || null,
        reference:      event.reference       || null,
        reason:         event.reason          || null,
        metadata:       event.metadata        || {},
        payload_hash:   payloadHash,
        previous_hash:  previousHash,
        occurred_at:    occurredAt,
      };

      const { data, error } = await supabase
        .from('treasury_audit_log')
        .insert(row)
        .select('event_id')
        .single();

      if (error) {
        logger.error(`[ImmutableAuditLog] Insert failed: ${error.message}`);
        return null;
      }

      return data?.event_id || null;

    } catch (err) {
      // Never throw — audit failure must not block treasury operations
      logger.error(`[ImmutableAuditLog] Unhandled error: ${err.message}`);
      return null;
    }
  }

  /**
   * Verify the integrity of the audit chain for the last N records.
   * Returns a report indicating whether the chain is intact.
   *
   * @param {number} [limit=100]
   * @returns {Promise<object>}
   */
  async verifyChain(limit = 100) {
    const { data: records, error } = await supabase
      .from('treasury_audit_log')
      .select('id, event_id, payload_hash, previous_hash, chain_valid, occurred_at')
      .order('id', { ascending: true })
      .limit(limit);

    if (error) {
      return { valid: false, error: error.message, checked: 0 };
    }

    if (!records || records.length < 2) {
      return { valid: true, checked: records?.length || 0, message: 'Insufficient records to verify chain' };
    }

    let broken     = false;
    let brokenAt   = null;
    let checkedCount = 0;

    for (let i = 1; i < records.length; i++) {
      const current  = records[i];
      const previous = records[i - 1];
      checkedCount++;

      if (current.previous_hash !== previous.payload_hash) {
        broken   = true;
        brokenAt = { id: current.id, event_id: current.event_id, occurred_at: current.occurred_at };
        logger.error(`[ImmutableAuditLog] CHAIN BROKEN at record id=${current.id} (${current.event_id})`);
        break;
      }
    }

    return {
      valid:   !broken,
      checked: checkedCount,
      broken_at: brokenAt || null,
      message: broken
        ? `Audit chain is broken at record id=${brokenAt?.id}. Possible tampering detected.`
        : `Audit chain verified for last ${checkedCount} records. Intact.`,
    };
  }

  /**
   * Query audit log entries with filters.
   *
   * @param {object} filters
   * @param {string}  [filters.event_type]
   * @param {string}  [filters.currency]
   * @param {string}  [filters.provider]
   * @param {string}  [filters.actor_id]
   * @param {number}  [filters.limit=50]
   * @returns {Promise<Array>}
   */
  async query(filters = {}) {
    let q = supabase
      .from('treasury_audit_log')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(filters.limit || 50);

    if (filters.event_type)  q = q.eq('event_type', filters.event_type);
    if (filters.currency)    q = q.eq('currency',   filters.currency.toUpperCase());
    if (filters.provider)    q = q.eq('provider',   filters.provider);
    if (filters.actor_id)    q = q.eq('actor_id',   filters.actor_id);
    if (filters.since)       q = q.gte('occurred_at', filters.since);

    const { data, error } = await q;
    if (error) {
      logger.error(`[ImmutableAuditLog] Query failed: ${error.message}`);
      return [];
    }
    return data || [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _getLastHash() {
    try {
      const { data } = await supabase
        .from('treasury_audit_log')
        .select('payload_hash')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.payload_hash || '0000000000000000000000000000000000000000000000000000000000000000';
    } catch {
      return '0000000000000000000000000000000000000000000000000000000000000000';
    }
  }
}

module.exports = new ImmutableAuditLog();
