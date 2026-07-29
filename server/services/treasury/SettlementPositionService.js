'use strict';
/**
 * SettlementPositionService.js
 * ============================
 * Per-provider settlement state machine.
 * Manages lifecycle transitions for every payment across all providers.
 *
 * Stages:
 *   COLLECTED → PENDING_SETTLEMENT → SETTLED
 *                                  → FAILED
 *                                  → REVERSED
 *                                  → CHARGEBACK
 *                                  → REFUNDED
 *
 * Every stage transition is recorded immutably in settlement_position_transitions.
 * No direct UPDATE to settlement_positions is permitted without going through this service.
 *
 * @module services/treasury/SettlementPositionService
 */

const supabase   = require('../../config/database');
const logger     = require('../../utils/logger');

// Valid stage transitions
const VALID_TRANSITIONS = {
  COLLECTED:          ['PENDING_SETTLEMENT', 'REVERSED'],
  PENDING_SETTLEMENT: ['SETTLED', 'FAILED', 'REVERSED'],
  SETTLED:            ['REVERSED', 'CHARGEBACK', 'REFUNDED'],
  FAILED:             ['PENDING_SETTLEMENT'],  // Retry allowed
  REVERSED:           [],
  CHARGEBACK:         ['REFUNDED'],
  REFUNDED:           [],
};

const SettlementPositionService = {
  /**
   * Create a new settlement position.
   */
  async create({ correlationId, transactionId, provider, providerReference, currency, grossAmount, feeAmount = 0, expectedSettlement, metadata = {} }) {
    const { data, error } = await supabase
      .from('settlement_positions')
      .insert({
        correlation_id:      correlationId || null,
        transaction_id:      transactionId,
        provider:            String(provider).toLowerCase(),
        provider_reference:  providerReference || null,
        currency:            String(currency).toUpperCase(),
        gross_amount:        parseFloat(grossAmount),
        fee_amount:          parseFloat(feeAmount),
        settlement_stage:    'COLLECTED',
        expected_settlement: expectedSettlement || null,
        metadata,
      })
      .select()
      .single();

    if (error) throw new Error(`[SettlementPositionService] Create failed: ${error.message}`);

    // Record initial transition
    await this._recordTransition(data.id, null, 'COLLECTED', 'SettlementPositionService', 'Position created');

    logger.info(`[SettlementPosition] Created: ${data.id} | ${provider} | ${grossAmount} ${currency}`);
    return data;
  },

  /**
   * Advance a settlement position to a new stage.
   * Validates the transition is permitted.
   */
  async advance(positionId, newStage, { transitionedBy = 'SYSTEM', reason, metadata = {} } = {}) {
    // Load current state
    const { data: position } = await supabase
      .from('settlement_positions')
      .select('id, settlement_stage, provider, currency, gross_amount')
      .eq('id', positionId)
      .single();

    if (!position) throw new Error(`[SettlementPositionService] Position ${positionId} not found`);

    const currentStage = position.settlement_stage;
    const allowed      = VALID_TRANSITIONS[currentStage] || [];

    if (!allowed.includes(newStage)) {
      throw new Error(`[SettlementPositionService] Invalid transition: ${currentStage} → ${newStage} for ${positionId}`);
    }

    // Update position
    const updates = {
      settlement_stage: newStage,
      updated_at:       new Date().toISOString(),
    };

    if (newStage === 'SETTLED')   updates.actual_settlement = new Date().toISOString();
    if (newStage === 'REVERSED')  updates.reversal_reason   = reason || null;
    if (newStage === 'FAILED')    updates.failure_reason    = reason || null;

    await supabase
      .from('settlement_positions')
      .update(updates)
      .eq('id', positionId);

    // Record transition
    await this._recordTransition(positionId, currentStage, newStage, transitionedBy, reason);

    logger.info(`[SettlementPosition] ${positionId}: ${currentStage} → ${newStage}`);
    return { positionId, from: currentStage, to: newStage };
  },

  /**
   * Advance by provider reference (used by webhook handlers).
   */
  async advanceByProviderRef(providerReference, provider, newStage, options = {}) {
    const { data } = await supabase
      .from('settlement_positions')
      .select('id, settlement_stage')
      .eq('provider_reference', providerReference)
      .eq('provider', String(provider).toLowerCase())
      .maybeSingle();

    if (!data) {
      logger.warn(`[SettlementPosition] No position found for ${provider} ref: ${providerReference}`);
      return null;
    }

    return this.advance(data.id, newStage, options);
  },

  /**
   * Get all positions by provider and stage (dashboard / monitoring).
   */
  async getByStage(provider, stage, { currency, limit = 100 } = {}) {
    let q = supabase
      .from('settlement_positions')
      .select('*')
      .eq('provider', String(provider).toLowerCase())
      .eq('settlement_stage', stage)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (currency) q = q.eq('currency', String(currency).toUpperCase());

    const { data } = await q;
    return data || [];
  },

  /**
   * Get stuck settlements (PENDING_SETTLEMENT for > N hours).
   */
  async getStuckSettlements(thresholdHours = 24) {
    const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('settlement_positions')
      .select('*')
      .eq('settlement_stage', 'PENDING_SETTLEMENT')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });
    return data || [];
  },

  /**
   * Get settlement pipeline summary per provider (for dashboard).
   */
  async getPipelineSummary() {
    const { data } = await supabase
      .from('settlement_positions')
      .select('provider, currency, settlement_stage, gross_amount');

    const summary = {};
    for (const row of (data || [])) {
      const key = `${row.provider}:${row.currency}`;
      if (!summary[key]) {
        summary[key] = { provider: row.provider, currency: row.currency, stages: {} };
      }
      const stage = row.settlement_stage;
      if (!summary[key].stages[stage]) summary[key].stages[stage] = { count: 0, total: 0 };
      summary[key].stages[stage].count++;
      summary[key].stages[stage].total += parseFloat(row.gross_amount || 0);
    }

    return Object.values(summary);
  },

  async _recordTransition(positionId, fromStage, toStage, transitionedBy, reason) {
    await supabase
      .from('settlement_position_transitions')
      .insert({
        position_id:     positionId,
        from_stage:      fromStage || null,
        to_stage:        toStage,
        transitioned_by: transitionedBy || 'SYSTEM',
        reason:          reason || null,
      })
      .catch(e => logger.warn(`[SettlementPosition] Transition log failed: ${e.message}`));
  },

  VALID_TRANSITIONS,
};

module.exports = SettlementPositionService;
