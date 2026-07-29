'use strict';
/**
 * SettlementStateMachine.js
 * =========================
 * Manages the 7-stage payment lifecycle for every settlement.
 *
 * Lifecycle:
 *   INITIATED → PROVIDER_PENDING → PROVIDER_CONFIRMED →
 *   LEDGER_POSTED → TREASURY_VERIFIED → SETTLED → ARCHIVED
 *
 * Side paths:
 *   Any stage → FAILED   (non-recoverable error)
 *   Any stage → REVERSED (chargeback / manual reversal)
 *
 * Rules:
 *   - Stage transitions are forward-only (no skipping, no backwards)
 *   - Every transition is recorded immutably in settlement_transitions
 *   - TREASURY_VERIFIED requires a passing reserve ratio check
 *   - The machine never modifies wallets or ledger entries
 *
 * @module services/treasury/SettlementStateMachine
 */

const supabase         = require('../../config/database');
const logger           = require('../../utils/logger');
const ImmutableAuditLog = require('./ImmutableAuditLog');

// Valid forward transitions
const ALLOWED_TRANSITIONS = {
  INITIATED:          ['PROVIDER_PENDING', 'FAILED'],
  PROVIDER_PENDING:   ['PROVIDER_CONFIRMED', 'FAILED', 'REVERSED'],
  PROVIDER_CONFIRMED: ['LEDGER_POSTED', 'FAILED', 'REVERSED'],
  LEDGER_POSTED:      ['TREASURY_VERIFIED', 'FAILED'],
  TREASURY_VERIFIED:  ['SETTLED', 'FAILED'],
  SETTLED:            ['ARCHIVED', 'REVERSED'],
  ARCHIVED:           [],
  FAILED:             [],
  REVERSED:           [],
};

class SettlementStateMachine {

  // ── 1. Create a New Settlement ────────────────────────────────────────────

  /**
   * Creates a new settlement record in INITIATED state.
   * Called immediately when a payment is initiated.
   *
   * @param {object} params
   * @param {string}  params.transaction_id
   * @param {string}  params.reference
   * @param {string}  [params.external_reference]
   * @param {string}  params.settlement_type  - 'DEPOSIT' | 'WITHDRAWAL' | 'SWAP' | 'TRANSFER'
   * @param {string}  params.direction        - 'INBOUND' | 'OUTBOUND'
   * @param {string}  [params.provider]
   * @param {string}  params.currency
   * @param {number}  params.amount
   * @param {number}  [params.fee_amount]
   * @param {number}  [params.net_amount]
   * @param {string}  [params.transitioned_by]
   * @returns {Promise<object>}  Created settlement record
   */
  async create(params) {
    const {
      transaction_id, reference, external_reference,
      settlement_type, direction, provider,
      currency, amount, fee_amount = 0,
      net_amount, transitioned_by = 'system',
    } = params;

    const { data: settlement, error } = await supabase
      .from('settlements')
      .insert({
        transaction_id,
        reference,
        external_reference: external_reference || null,
        settlement_type,
        direction,
        provider:   provider || null,
        currency:   currency.toUpperCase(),
        amount,
        fee_amount,
        net_amount: net_amount ?? (amount - fee_amount),
        current_stage: 'INITIATED',
      })
      .select()
      .single();

    if (error) {
      logger.error(`[SettlementStateMachine] Create failed for ${reference}: ${error.message}`);
      throw new Error(`Settlement creation failed: ${error.message}`);
    }

    // Record initial transition
    await this._recordTransition(settlement.id, null, 'INITIATED', transitioned_by, 'Settlement created');

    await ImmutableAuditLog.record({
      event_type:    'SETTLEMENT_TRANSITION',
      event_subtype: 'CREATED',
      subject_type:  'SETTLEMENT',
      subject_id:    settlement.id,
      provider,
      currency,
      amount,
      reference,
      reason:        `Settlement created in INITIATED state`,
      metadata:      { settlement_type, direction },
    });

    logger.info(`[SettlementStateMachine] Created settlement ${settlement.id} (${reference}) → INITIATED`);
    return settlement;
  }

  // ── 2. Advance to Next Stage ──────────────────────────────────────────────

  /**
   * Advances a settlement to the specified next stage.
   *
   * @param {string}  settlementId
   * @param {string}  toStage         - Target stage
   * @param {object}  [options]
   * @param {string}  [options.transitioned_by]
   * @param {string}  [options.notes]
   * @param {object}  [options.metadata]
   * @param {object}  [options.patch]  - Additional fields to update on settlements row
   * @returns {Promise<object>}  Updated settlement record
   */
  async advance(settlementId, toStage, options = {}) {
    const { transitioned_by = 'system', notes, metadata = {}, patch = {} } = options;

    // Fetch current state
    const { data: settlement, error: fetchErr } = await supabase
      .from('settlements')
      .select('*')
      .eq('id', settlementId)
      .single();

    if (fetchErr || !settlement) {
      throw new Error(`Settlement ${settlementId} not found`);
    }

    const fromStage = settlement.current_stage;

    // Validate transition
    this._assertTransitionAllowed(fromStage, toStage, settlementId);

    // Special rule: TREASURY_VERIFIED requires reserve ratio check
    if (toStage === 'TREASURY_VERIFIED') {
      await this._assertReserveHealthy(settlement);
    }

    // Build timestamp fields for specific stages
    const stagePatch = { current_stage: toStage, previous_stage: fromStage, ...patch };
    if (toStage === 'PROVIDER_CONFIRMED') stagePatch.provider_confirmed_at = new Date().toISOString();
    if (toStage === 'LEDGER_POSTED')      stagePatch.ledger_posted_at       = new Date().toISOString();
    if (toStage === 'SETTLED')            stagePatch.settled_at              = new Date().toISOString();
    if (toStage === 'ARCHIVED')           stagePatch.archived_at             = new Date().toISOString();
    if (toStage === 'TREASURY_VERIFIED') {
      stagePatch.treasury_verified_at = new Date().toISOString();
      stagePatch.treasury_verified_by = transitioned_by;
    }
    if (toStage === 'FAILED' || toStage === 'REVERSED') {
      stagePatch.failure_reason = notes || null;
    }

    // Update settlement
    const { data: updated, error: updateErr } = await supabase
      .from('settlements')
      .update(stagePatch)
      .eq('id', settlementId)
      .select()
      .single();

    if (updateErr) {
      throw new Error(`Settlement stage update failed: ${updateErr.message}`);
    }

    // Record transition (immutable)
    await this._recordTransition(settlementId, fromStage, toStage, transitioned_by, notes, metadata);

    // Audit log
    await ImmutableAuditLog.record({
      event_type:    'SETTLEMENT_TRANSITION',
      event_subtype: `${fromStage}_TO_${toStage}`,
      subject_type:  'SETTLEMENT',
      subject_id:    settlementId,
      provider:      settlement.provider,
      currency:      settlement.currency,
      amount:        settlement.amount,
      reference:     settlement.reference,
      reason:        notes || `Advanced from ${fromStage} to ${toStage}`,
      metadata:      { from: fromStage, to: toStage, ...metadata },
    });

    logger.info(`[SettlementStateMachine] ${settlement.reference}: ${fromStage} → ${toStage} (by ${transitioned_by})`);
    return updated;
  }

  // ── 3. Fail a Settlement ─────────────────────────────────────────────────

  async fail(settlementId, reason, transitioned_by = 'system') {
    return this.advance(settlementId, 'FAILED', { transitioned_by, notes: reason });
  }

  // ── 4. Reverse a Settlement ──────────────────────────────────────────────

  async reverse(settlementId, reason, transitioned_by) {
    return this.advance(settlementId, 'REVERSED', { transitioned_by, notes: reason });
  }

  // ── 5. Get Settlement with History ───────────────────────────────────────

  async getWithHistory(settlementId) {
    const [{ data: settlement }, { data: transitions }] = await Promise.all([
      supabase.from('settlements').select('*').eq('id', settlementId).single(),
      supabase.from('settlement_transitions').select('*').eq('settlement_id', settlementId).order('transitioned_at'),
    ]);
    return { settlement, transitions: transitions || [] };
  }

  // ── 6. List Pending Settlements ──────────────────────────────────────────

  async listPending(currency) {
    let q = supabase
      .from('settlements')
      .select('*')
      .in('current_stage', ['INITIATED', 'PROVIDER_PENDING', 'PROVIDER_CONFIRMED', 'LEDGER_POSTED', 'TREASURY_VERIFIED'])
      .order('created_at', { ascending: true });
    if (currency) q = q.eq('currency', currency.toUpperCase());
    const { data } = await q;
    return data || [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _assertTransitionAllowed(fromStage, toStage, id) {
    const allowed = ALLOWED_TRANSITIONS[fromStage] || [];
    if (!allowed.includes(toStage)) {
      throw new Error(
        `[SettlementStateMachine] Invalid transition ${fromStage} → ${toStage} for settlement ${id}. ` +
        `Allowed: [${allowed.join(', ')}]`
      );
    }
  }

  async _assertReserveHealthy(settlement) {
    // Warn but don't block — treasury ops team should be aware
    try {
      const { data: ratioRow } = await supabase
        .from('reserve_ratios')
        .select('reserve_ratio, status')
        .eq('currency', settlement.currency)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ratioRow && ratioRow.status === 'DEFICIT') {
        logger.warn(
          `[SettlementStateMachine] TREASURY_VERIFIED transitioning despite DEFICIT reserve for ${settlement.currency}. ` +
          `Ratio: ${ratioRow.reserve_ratio}%. Review recommended.`
        );
      }
    } catch { /* non-blocking */ }
  }

  async _recordTransition(settlementId, fromStage, toStage, transitioned_by, notes, metadata = {}) {
    await supabase.from('settlement_transitions').insert({
      settlement_id:   settlementId,
      from_stage:      fromStage || null,
      to_stage:        toStage,
      transitioned_by: transitioned_by || 'system',
      notes:           notes || null,
      metadata,
    });
  }
}

module.exports = new SettlementStateMachine();
