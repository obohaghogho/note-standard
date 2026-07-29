'use strict';
/**
 * NightlyReconciliationPipeline.js
 * =================================
 * 5-stage nightly reconciliation pipeline:
 *
 *   Stage 1: LEDGER          — Validate double-entry invariant (all entries balance)
 *   Stage 2: PROVIDER_TXNS   — Compare provider transactions vs. internal records
 *   Stage 3: PROVIDER_BALANCE — Compare provider live balance vs. treasury snapshot
 *   Stage 4: TREASURY        — Validate reserve ratios are consistent
 *   Stage 5: SETTLEMENT      — Check for stuck/delayed settlements
 *
 * Creates a reconciliation_run record, updates stage-by-stage, persists line items.
 *
 * @module services/treasury/NightlyReconciliationPipeline
 */

const supabase              = require('../../config/database');
const logger                = require('../../utils/logger');
const AnchorReconciliation  = require('../anchor/AnchorReconciliation');
const MultiProviderReserveEngine = require('./MultiProviderReserveEngine');
const SettlementPositionService  = require('./SettlementPositionService');
const ImmutableAuditLog     = require('./ImmutableAuditLog');

const STAGE_FIELDS = {
  1: 'stage_ledger',
  2: 'stage_provider_txns',
  3: 'stage_provider_balance',
  4: 'stage_treasury',
  5: 'stage_settlement',
};

const NightlyReconciliationPipeline = {
  /**
   * Run the full 5-stage pipeline.
   * @param {string} runType - NIGHTLY | MANUAL | TRIGGERED
   */
  async run(runType = 'NIGHTLY') {
    const startedAt = new Date();
    const runDate   = new Date().toISOString().split('T')[0];

    logger.info(`[ReconPipeline] Starting ${runType} reconciliation for ${runDate}`);

    // ── Create run record ────────────────────────────────────────────────────
    const { data: run, error: runError } = await supabase
      .from('reconciliation_runs')
      .insert({
        run_type:   runType,
        status:     'RUNNING',
        run_date:   runDate,
        started_at: startedAt.toISOString(),
        triggered_by: runType === 'NIGHTLY' ? 'CRON' : 'ADMIN',
      })
      .select()
      .single();

    if (runError) {
      logger.error(`[ReconPipeline] Failed to create run record: ${runError.message}`);
      return null;
    }

    const runId = run.id;
    let totalChecked      = 0;
    let totalMatched      = 0;
    let totalDiscrepancies = 0;
    const stageResults   = {};

    const dateFrom = new Date(startedAt);
    dateFrom.setDate(dateFrom.getDate() - 1);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(startedAt);
    dateTo.setHours(0, 0, 0, 0);

    // ── Stage 1: LEDGER ───────────────────────────────────────────────────────
    await this._updateStage(runId, 1, 'RUNNING');
    try {
      stageResults.ledger = await this._stageLedger(runId);
      totalChecked       += stageResults.ledger.checked;
      totalDiscrepancies += stageResults.ledger.discrepancies;
      await this._updateStage(runId, 1, 'COMPLETED');
    } catch (err) {
      logger.error(`[ReconPipeline] Stage 1 (LEDGER) failed: ${err.message}`);
      await this._updateStage(runId, 1, 'FAILED');
      stageResults.ledger = { error: err.message };
    }

    // ── Stage 2: PROVIDER_TXNS ────────────────────────────────────────────────
    await this._updateStage(runId, 2, 'RUNNING');
    try {
      stageResults.providerTxns = await this._stageProviderTxns(runId, dateFrom, dateTo);
      totalChecked       += stageResults.providerTxns.total_checked || 0;
      totalMatched       += stageResults.providerTxns.matched || 0;
      totalDiscrepancies += stageResults.providerTxns.discrepancies || 0;
      await this._updateStage(runId, 2, 'COMPLETED');
    } catch (err) {
      logger.error(`[ReconPipeline] Stage 2 (PROVIDER_TXNS) failed: ${err.message}`);
      await this._updateStage(runId, 2, 'FAILED');
      stageResults.providerTxns = { error: err.message };
    }

    // ── Stage 3: PROVIDER_BALANCE ─────────────────────────────────────────────
    await this._updateStage(runId, 3, 'RUNNING');
    try {
      stageResults.providerBalance = await this._stageProviderBalance(runId);
      totalDiscrepancies += stageResults.providerBalance.discrepancies || 0;
      await this._updateStage(runId, 3, 'COMPLETED');
    } catch (err) {
      logger.error(`[ReconPipeline] Stage 3 (PROVIDER_BALANCE) failed: ${err.message}`);
      await this._updateStage(runId, 3, 'FAILED');
      stageResults.providerBalance = { error: err.message };
    }

    // ── Stage 4: TREASURY ─────────────────────────────────────────────────────
    await this._updateStage(runId, 4, 'RUNNING');
    try {
      stageResults.treasury = await this._stageTreasury();
      await this._updateStage(runId, 4, 'COMPLETED');
    } catch (err) {
      logger.error(`[ReconPipeline] Stage 4 (TREASURY) failed: ${err.message}`);
      await this._updateStage(runId, 4, 'FAILED');
      stageResults.treasury = { error: err.message };
    }

    // ── Stage 5: SETTLEMENT ───────────────────────────────────────────────────
    await this._updateStage(runId, 5, 'RUNNING');
    try {
      stageResults.settlement = await this._stageSettlement(runId);
      totalDiscrepancies += stageResults.settlement.stuck || 0;
      await this._updateStage(runId, 5, 'COMPLETED');
    } catch (err) {
      logger.error(`[ReconPipeline] Stage 5 (SETTLEMENT) failed: ${err.message}`);
      await this._updateStage(runId, 5, 'FAILED');
      stageResults.settlement = { error: err.message };
    }

    // ── Finalise run ──────────────────────────────────────────────────────────
    const completedAt   = new Date();
    const durationMs    = completedAt - startedAt;
    const hasErrors     = Object.values(stageResults).some(s => s.error);
    const finalStatus   = hasErrors ? 'PARTIAL' : 'COMPLETED';

    await supabase
      .from('reconciliation_runs')
      .update({
        status:              finalStatus,
        total_checked:       totalChecked,
        total_matched:       totalMatched,
        total_discrepancies: totalDiscrepancies,
        completed_at:        completedAt.toISOString(),
        duration_ms:         durationMs,
        report_summary:      stageResults,
      })
      .eq('id', runId);

    await ImmutableAuditLog.record({
      event_type:   'NIGHTLY_RECONCILIATION_COMPLETED',
      actor_type:   'SYSTEM',
      actor_id:     'NightlyReconciliationPipeline',
      subject_type: 'RECONCILIATION_RUN',
      subject_id:   runId,
      reason:       `${runType} reconciliation ${finalStatus}: ${totalDiscrepancies} discrepancies in ${durationMs}ms`,
      metadata:     { runId, stageResults, totalDiscrepancies },
    }).catch(() => {});

    logger.info(`[ReconPipeline] ${finalStatus} in ${durationMs}ms | discrepancies=${totalDiscrepancies}`);
    return { runId, status: finalStatus, totalDiscrepancies, durationMs, stages: stageResults };
  },

  // ── Stage Implementations ──────────────────────────────────────────────────────

  async _stageLedger(runId) {
    // Validate double-entry: sum of all DEBIT entries = sum of all CREDIT entries
    const { data: entries } = await supabase
      .from('ledger_entries_v6')
      .select('entry_type, amount')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString());

    const debits  = (entries || []).filter(e => e.entry_type === 'DEBIT').reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const credits = (entries || []).filter(e => e.entry_type === 'CREDIT').reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const diff    = Math.abs(debits - credits);
    const balanced = diff < 0.01;

    return {
      checked:       (entries || []).length,
      discrepancies: balanced ? 0 : 1,
      debits:        debits.toFixed(8),
      credits:       credits.toFixed(8),
      difference:    diff.toFixed(8),
      balanced,
    };
  },

  async _stageProviderTxns(runId, dateFrom, dateTo) {
    // Run Anchor reconciliation (extendable to Fincra, etc.)
    const anchor = await AnchorReconciliation.reconcile(runId, dateFrom, dateTo);
    return { ...anchor, total_checked: anchor.total_checked || 0 };
  },

  async _stageProviderBalance(runId) {
    // Compare live balances vs. treasury snapshot
    const ratios = await MultiProviderReserveEngine.computeAll();
    const discrepancies = Object.values(ratios).filter(r => r.status === 'EMERGENCY' || r.status === 'CRITICAL').length;
    return { currencies: ratios, discrepancies };
  },

  async _stageTreasury() {
    const ratios = await MultiProviderReserveEngine.getLatestRatios();
    const warnings = ratios.filter(r => r.reserve_ratio < 105);
    return { total_currencies: ratios.length, warnings: warnings.length, ratios };
  },

  async _stageSettlement() {
    const stuck = await SettlementPositionService.getStuckSettlements(24);
    return { stuck: stuck.length, stuckRecords: stuck.map(s => ({ id: s.id, provider: s.provider, currency: s.currency })) };
  },

  async _updateStage(runId, stageNum, status) {
    const field = STAGE_FIELDS[stageNum];
    if (!field) return;
    await supabase
      .from('reconciliation_runs')
      .update({ [field]: status, updated_at: new Date().toISOString() })
      .eq('id', runId)
      .catch(() => {});
  },
};

module.exports = NightlyReconciliationPipeline;
