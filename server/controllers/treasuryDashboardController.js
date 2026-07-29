'use strict';
/**
 * treasuryDashboardController.js
 * ==============================
 * Handles all HTTP requests for the treasury admin dashboard.
 *
 * All routes require requireAdmin middleware (enforced in router).
 * This controller is read-heavy — it never mutates wallets or ledger.
 * The only write operations are:
 *   - Requesting a treasury transfer (POST /transfers)
 *   - Approving a treasury transfer (POST /transfers/:id/approve)
 *   - Cancelling a treasury transfer (POST /transfers/:id/cancel)
 *   - Triggering a manual sync (POST /sync)
 *
 * @module controllers/treasuryDashboardController
 */

const logger                  = require('../utils/logger');
const supabase                = require('../config/database');
const TreasuryDashboardService = require('../services/treasury/TreasuryDashboardService');
const TreasuryBalanceSyncWorker = require('../workers/TreasuryBalanceSyncWorker');
const ReserveCalculator        = require('../services/treasury/ReserveCalculator');
const ImmutableAuditLog        = require('../services/treasury/ImmutableAuditLog');
const SettlementStateMachine   = require('../services/treasury/SettlementStateMachine');

// ── Utility ───────────────────────────────────────────────────────────────────
const ok  = (res, data, status = 200) => res.status(status).json({ success: true,  ...data });
const err = (res, msg, status = 500)  => res.status(status).json({ success: false, error: msg });

// ── 1. Full Dashboard ─────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const data = await TreasuryDashboardService.getFullDashboard();
    ok(res, data);
  } catch (e) {
    logger.error(`[TreasuryCtrl] getDashboard: ${e.message}`);
    err(res, e.message);
  }
};

// ── 2. Quick Summary ──────────────────────────────────────────────────────────
exports.getQuickSummary = async (req, res) => {
  try {
    const data = await TreasuryDashboardService.getQuickSummary();
    ok(res, { data });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 3. Reserve Ratios ─────────────────────────────────────────────────────────
exports.getReserveRatios = async (req, res) => {
  try {
    const ratios = await ReserveCalculator.getLatestRatios();
    ok(res, { data: ratios });
  } catch (e) {
    err(res, e.message);
  }
};

exports.getReserveHistory = async (req, res) => {
  try {
    const { currency } = req.params;
    const hours        = parseInt(req.query.hours || '24', 10);
    if (!currency) return err(res, 'currency param required', 400);
    const data = await TreasuryDashboardService.getReserveHistory(currency.toUpperCase(), hours);
    ok(res, { data });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 4. Provider Balances ──────────────────────────────────────────────────────
exports.getProviderBalances = async (req, res) => {
  try {
    const { data: balances } = await supabase
      .from('treasury_provider_balances')
      .select('*')
      .order('provider');
    ok(res, { data: balances || [] });
  } catch (e) {
    err(res, e.message);
  }
};

exports.getSnapshotHistory = async (req, res) => {
  try {
    const { provider, currency } = req.params;
    const limit = parseInt(req.query.limit || '100', 10);
    const data  = await TreasuryDashboardService.getSnapshotHistory(provider, currency.toUpperCase(), limit);
    ok(res, { data });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 5. Manual Sync Trigger ────────────────────────────────────────────────────
exports.triggerSync = async (req, res) => {
  try {
    const adminId = req.user?.id || 'unknown';
    logger.info(`[TreasuryCtrl] Manual sync triggered by admin ${adminId}`);
    // Fire async — do not await (can take several seconds)
    TreasuryBalanceSyncWorker.triggerManualSync(`admin:${adminId}`)
      .catch(e => logger.error(`[TreasuryCtrl] Manual sync error: ${e.message}`));
    ok(res, { message: 'Sync cycle initiated. Results will be available in ~30 seconds.' });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 6. Provider Health ────────────────────────────────────────────────────────
exports.getProviderHealth = async (req, res) => {
  try {
    const { data } = await supabase
      .from('provider_health_status')
      .select('*')
      .order('provider');
    ok(res, { data: data || [] });
  } catch (e) {
    err(res, e.message);
  }
};

exports.getProbeHistory = async (req, res) => {
  try {
    const { provider } = req.params;
    const limit        = parseInt(req.query.limit || '50', 10);
    const { data }     = await supabase
      .from('provider_health_probes')
      .select('*')
      .eq('provider', provider)
      .order('probed_at', { ascending: false })
      .limit(limit);
    ok(res, { data: data || [] });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 7. Settlements ────────────────────────────────────────────────────────────
exports.getSettlements = async (req, res) => {
  try {
    const stage    = req.query.stage;
    const currency = req.query.currency;
    const limit    = parseInt(req.query.limit || '50', 10);

    let q = supabase
      .from('settlements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (stage)    q = q.eq('current_stage', stage);
    if (currency) q = q.eq('currency', currency.toUpperCase());

    const { data } = await q;
    ok(res, { data: data || [] });
  } catch (e) {
    err(res, e.message);
  }
};

exports.getSettlementDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const data   = await SettlementStateMachine.getWithHistory(id);
    ok(res, { data });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 8. Treasury Transfers ─────────────────────────────────────────────────────
exports.getTransfers = async (req, res) => {
  try {
    const { data } = await supabase
      .from('treasury_transfers')
      .select('*, requested_by_profile:requested_by(full_name, email), approved_by_profile:approved_by(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(50);
    ok(res, { data: data || [] });
  } catch (e) {
    err(res, e.message);
  }
};

exports.requestTransfer = async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) return err(res, 'Unauthorized', 401);

    const {
      source_provider, target_provider, currency,
      amount, transfer_type = 'REBALANCE', requested_reason,
    } = req.body;

    if (!source_provider || !target_provider || !currency || !amount || !requested_reason) {
      return err(res, 'source_provider, target_provider, currency, amount, and requested_reason are required', 400);
    }
    if (parseFloat(amount) <= 0) return err(res, 'amount must be positive', 400);

    const { data, error } = await supabase
      .from('treasury_transfers')
      .insert({
        source_provider,
        target_provider,
        currency:          currency.toUpperCase(),
        amount:            parseFloat(amount),
        transfer_type,
        requested_reason,
        requested_by:      adminId,
        status:            'PENDING_APPROVAL',
      })
      .select()
      .single();

    if (error) return err(res, error.message);

    await ImmutableAuditLog.record({
      event_type:    'TREASURY_TRANSFER_REQUESTED',
      actor_type:    'ADMIN',
      actor_id:      adminId,
      subject_type:  'TREASURY_TRANSFER',
      subject_id:    data.id,
      currency,
      amount:        parseFloat(amount),
      reason:        requested_reason,
      metadata:      { source_provider, target_provider, transfer_type },
    });

    ok(res, { data, message: 'Transfer request created. Awaiting approval.' }, 201);
  } catch (e) {
    err(res, e.message);
  }
};

exports.approveTransfer = async (req, res) => {
  try {
    const adminId     = req.user?.id;
    const { id }      = req.params;
    const { notes }   = req.body;

    if (!adminId) return err(res, 'Unauthorized', 401);

    const { data: transfer } = await supabase
      .from('treasury_transfers')
      .select('*')
      .eq('id', id)
      .single();

    if (!transfer) return err(res, 'Transfer not found', 404);
    if (transfer.status !== 'PENDING_APPROVAL') return err(res, `Transfer is ${transfer.status}, not PENDING_APPROVAL`, 409);

    // Prevent self-approval
    if (transfer.requested_by === adminId) {
      return err(res, 'You cannot approve your own transfer request', 403);
    }

    const { data, error } = await supabase
      .from('treasury_transfers')
      .update({
        status:        'APPROVED',
        approved_by:   adminId,
        approved_at:   new Date().toISOString(),
        approval_notes: notes || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return err(res, error.message);

    await ImmutableAuditLog.record({
      event_type:   'TREASURY_TRANSFER_APPROVED',
      actor_type:   'ADMIN',
      actor_id:     adminId,
      subject_type: 'TREASURY_TRANSFER',
      subject_id:   id,
      currency:     transfer.currency,
      amount:       transfer.amount,
      reason:       notes || 'Approved',
    });

    ok(res, { data, message: 'Transfer approved. Ready for execution.' });
  } catch (e) {
    err(res, e.message);
  }
};

exports.executeTransfer = async (req, res) => {
  try {
    const adminId = req.user?.id || 'admin';
    const { id }  = req.params;
    const TreasuryTransferExecutionService = require('../services/treasury/TreasuryTransferExecutionService');
    const result = await TreasuryTransferExecutionService.executeTransfer(id, adminId);
    ok(res, { data: result, message: 'Treasury transfer executed successfully.' });
  } catch (e) {
    err(res, e.message);
  }
};

exports.cancelTransfer = async (req, res) => {
  try {
    const adminId   = req.user?.id;
    const { id }    = req.params;
    const { reason } = req.body;

    if (!adminId) return err(res, 'Unauthorized', 401);

    const { data: transfer } = await supabase
      .from('treasury_transfers')
      .select('*').eq('id', id).single();

    if (!transfer) return err(res, 'Transfer not found', 404);
    if (['COMPLETED', 'EXECUTING'].includes(transfer.status)) {
      return err(res, `Cannot cancel transfer in status: ${transfer.status}`, 409);
    }

    const { data, error } = await supabase
      .from('treasury_transfers')
      .update({
        status:              'CANCELLED',
        cancelled_by:        adminId,
        cancelled_at:        new Date().toISOString(),
        cancellation_reason: reason || 'Cancelled by admin',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return err(res, error.message);

    await ImmutableAuditLog.record({
      event_type:   'TREASURY_TRANSFER_CANCELLED',
      actor_type:   'ADMIN',
      actor_id:     adminId,
      subject_type: 'TREASURY_TRANSFER',
      subject_id:   id,
      currency:     transfer.currency,
      amount:       transfer.amount,
      reason:       reason || 'Cancelled',
    });

    ok(res, { data, message: 'Transfer cancelled.' });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 9. Liquidity ──────────────────────────────────────────────────────────────
exports.getLiquidityReport = async (req, res) => {
  try {
    const LiquidityEngine = require('../services/treasury/LiquidityEngine');
    const data            = await LiquidityEngine.computeAll();
    ok(res, { data: Object.values(data) });
  } catch (e) {
    err(res, e.message);
  }
};

exports.getLiquidityRecommendations = async (req, res) => {
  try {
    const LiquidityEngine = require('../services/treasury/LiquidityEngine');
    const data            = await LiquidityEngine.getOpenRecommendations();
    ok(res, { data });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 10. FX Positions ──────────────────────────────────────────────────────────
exports.getFXExposure = async (req, res) => {
  try {
    const FXTreasuryEngine = require('../services/treasury/FXTreasuryEngine');
    const [exposure, pnl]  = await Promise.all([
      FXTreasuryEngine.getExposureSummary(),
      FXTreasuryEngine.getDailyPnL(req.query.date),
    ]);
    ok(res, { exposure, daily_pnl: pnl });
  } catch (e) {
    err(res, e.message);
  }
};

exports.getRecentFXTrades = async (req, res) => {
  try {
    const FXTreasuryEngine = require('../services/treasury/FXTreasuryEngine');
    const limit = parseInt(req.query.limit || '50', 10);
    const data  = await FXTreasuryEngine.getRecentTrades(limit);
    ok(res, { data });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 11. Audit Log ─────────────────────────────────────────────────────────────
exports.getAuditEvents = async (req, res) => {
  try {
    const { event_type, currency, provider, limit, since } = req.query;
    const data = await TreasuryDashboardService.getAuditEvents({
      event_type, currency, provider,
      limit: parseInt(limit || '50', 10),
      since,
    });
    ok(res, { data });
  } catch (e) {
    err(res, e.message);
  }
};

exports.verifyAuditChain = async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit || '200', 10);
    const result = await TreasuryDashboardService.verifyAuditChain(limit);
    ok(res, { data: result });
  } catch (e) {
    err(res, e.message);
  }
};

// ── 12. Observability Metrics ─────────────────────────────────────────────────
exports.getMetrics = async (req, res) => {
  try {
    const TreasuryHealth = require('../services/treasury/TreasuryHealth');
    const [health, provHealth] = await Promise.all([
      TreasuryHealth.computeHealthReport(),
      supabase.from('provider_health_status').select('provider, status, success_rate, avg_latency_ms, circuit_breaker'),
    ]);

    const { data: dailyTx } = await supabase
      .from('transactions')
      .select('type, amount, currency')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .in('status', ['COMPLETED', 'CONFIRMED', 'SUCCESS']);

    const deposits    = (dailyTx || []).filter(t => t.type === 'DEPOSIT');
    const withdrawals = (dailyTx || []).filter(t => t.type === 'WITHDRAWAL');

    const totalDepositNGN    = deposits.filter(t => t.currency === 'NGN').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalWithdrawalNGN = withdrawals.filter(t => t.currency === 'NGN').reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    ok(res, {
      data: {
        treasury_health:       health,
        provider_availability: provHealth.data || [],
        daily_stats: {
          deposit_count:    deposits.length,
          withdrawal_count: withdrawals.length,
          deposit_volume_ngn:    totalDepositNGN,
          withdrawal_volume_ngn: totalWithdrawalNGN,
        },
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    err(res, e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 16: Enterprise Financial Platform Controllers
// ═══════════════════════════════════════════════════════════════════════════════

const ProviderHealthScorer    = require('../services/payment/ProviderHealthScorer');
const RebalancingAdvisor      = require('../services/treasury/RebalancingAdvisor');
const AITreasuryMonitor       = require('../services/treasury/AITreasuryMonitor');
const ProviderSLAService      = require('../services/treasury/ProviderSLAService');
const TreasuryForecaster      = require('../services/treasury/TreasuryForecaster');
const MultiProviderReserveEngine = require('../services/treasury/MultiProviderReserveEngine');
const SettlementPositionService  = require('../services/treasury/SettlementPositionService');
const SettlementCalendar         = require('../services/treasury/SettlementCalendar');
const NightlyReconciliationWorker = require('../workers/NightlyReconciliationWorker');
const EventReplayWorker          = require('../workers/EventReplayWorker');
const ProviderCertificationRegistry = require('../config/ProviderCertificationRegistry');
const CorrelationEngine          = require('../services/orchestration/CorrelationEngine');

// ── Routing ────────────────────────────────────────────────────────────────────
exports.getRoutingStats = async (req, res) => {
  try {
    const { data } = await supabase
      .from('routing_decisions')
      .select('selected_provider, outcome, failover_hop, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    ok(res, { data: data || [] });
  } catch (e) { err(res, e.message); }
};

exports.getRoutingPolicies = async (req, res) => {
  try {
    const { data } = await supabase.from('routing_policies').select('*').eq('is_active', true).order('priority');
    ok(res, { data: data || [] });
  } catch (e) { err(res, e.message); }
};

exports.getProviderHealthScores = async (req, res) => {
  try {
    const scores = await ProviderHealthScorer.getLatestScores();
    ok(res, { data: scores });
  } catch (e) { err(res, e.message); }
};

// ── Rebalancing ────────────────────────────────────────────────────────────────
exports.getRebalancingRecommendations = async (req, res) => {
  try {
    const { currency } = req.query;
    const data = await RebalancingAdvisor.getOpenRecommendations(currency);
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

exports.acknowledgeRebalancing = async (req, res) => {
  try {
    const { id }  = req.params;
    const adminId = req.user?.id;
    await supabase.from('rebalancing_recommendations').update({ status: 'ACKNOWLEDGED', acknowledged_by: adminId, updated_at: new Date().toISOString() }).eq('id', id);
    await ImmutableAuditLog.record({ event_type: 'REBALANCING_ACKNOWLEDGED', actor_type: 'ADMIN', actor_id: adminId, subject_type: 'REBALANCING_RECOMMENDATION', subject_id: id, reason: 'Admin acknowledged rebalancing recommendation' });
    ok(res, { acknowledged: true });
  } catch (e) { err(res, e.message); }
};

// ── AI Insights ────────────────────────────────────────────────────────────────
exports.getAIInsights = async (req, res) => {
  try {
    const data = await AITreasuryMonitor.getActiveInsights();
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

exports.acknowledgeInsight = async (req, res) => {
  try {
    const { id }  = req.params;
    await supabase.from('treasury_insights').update({ status: 'ACKNOWLEDGED', updated_at: new Date().toISOString() }).eq('id', id);
    ok(res, { acknowledged: true });
  } catch (e) { err(res, e.message); }
};

// ── SLA ────────────────────────────────────────────────────────────────────────
exports.getSLADashboard = async (req, res) => {
  try {
    const { period_type = 'DAILY' } = req.query;
    const data = await ProviderSLAService.getDashboard(period_type);
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

exports.getSLAHistory = async (req, res) => {
  try {
    const { provider }       = req.params;
    const { period_type, limit = 30 } = req.query;
    let q = supabase.from('provider_sla_metrics').select('*').eq('provider', provider).order('period_start', { ascending: false }).limit(parseInt(limit));
    if (period_type) q = q.eq('period_type', period_type);
    const { data } = await q;
    ok(res, { data: data || [] });
  } catch (e) { err(res, e.message); }
};

// ── Forecasts ──────────────────────────────────────────────────────────────────
exports.getTreasuryForecasts = async (req, res) => {
  try {
    const data = await TreasuryForecaster.getLatestForecasts();
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

exports.getCurrencyForecast = async (req, res) => {
  try {
    const data = await TreasuryForecaster.getLatestForecasts(req.params.currency);
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

// ── Balance Proof ──────────────────────────────────────────────────────────────
exports.getBalanceProof = async (req, res) => {
  try {
    const data = await MultiProviderReserveEngine.getBalanceProof();
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

// ── Settlement Pipeline ────────────────────────────────────────────────────────
exports.getSettlementPipeline = async (req, res) => {
  try {
    const data = await SettlementPositionService.getPipelineSummary();
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

exports.getStuckSettlements = async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '24');
    const data  = await SettlementPositionService.getStuckSettlements(hours);
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

// ── Reconciliation ─────────────────────────────────────────────────────────────
exports.getReconciliationRuns = async (req, res) => {
  try {
    const { data } = await supabase.from('reconciliation_runs').select('id, run_type, status, run_date, total_discrepancies, duration_ms, started_at, completed_at').order('started_at', { ascending: false }).limit(50);
    ok(res, { data: data || [] });
  } catch (e) { err(res, e.message); }
};

exports.triggerReconciliation = async (req, res) => {
  try {
    const result = await NightlyReconciliationWorker.runNow();
    ok(res, { data: result });
  } catch (e) { err(res, e.message, e.message.includes('already running') ? 409 : 500); }
};

exports.getReconciliationRunDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const [{ data: run }, { data: lineItems }] = await Promise.all([
      supabase.from('reconciliation_runs').select('*').eq('id', id).single(),
      supabase.from('reconciliation_line_items').select('*').eq('run_id', id).limit(500),
    ]);
    ok(res, { data: { run, lineItems: lineItems || [] } });
  } catch (e) { err(res, e.message); }
};

// ── Stress Simulation ──────────────────────────────────────────────────────────
exports.runStressSimulation = async (req, res) => {
  try {
    const { scenario = 'PROVIDER_DOWN', provider, currency } = req.body;
    // Lightweight scenario: project what happens if one provider goes offline
    const ratios   = await MultiProviderReserveEngine.computeAll();
    const forecasts = await TreasuryForecaster.generateAll();
    ok(res, { data: { scenario, ratios, forecasts, timestamp: new Date().toISOString() } });
  } catch (e) { err(res, e.message); }
};

// ── Event Replay ───────────────────────────────────────────────────────────────
exports.getReplayQueue = async (req, res) => {
  try {
    const data = await EventReplayWorker.getPendingReplay
      ? await EventReplayWorker.getPendingReplay()
      : await supabase.from('payment_execution_log').select('*').eq('execution_state', 'FAILED').order('created_at', { ascending: false }).limit(50).then(r => r.data || []);
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

exports.replayFailed = async (req, res) => {
  try {
    const result = await EventReplayWorker.replayFailed(req.body?.limit || 50);
    ok(res, { data: result });
  } catch (e) { err(res, e.message); }
};

exports.replayOne = async (req, res) => {
  try {
    const result = await EventReplayWorker.replayOne(req.params.correlationId);
    ok(res, { data: result });
  } catch (e) { err(res, e.message); }
};

// ── Certification ──────────────────────────────────────────────────────────────
exports.getCertificationStatus = async (req, res) => {
  try {
    const { data } = await supabase.from('banking_providers').select('provider_key, is_certified, certification_date, is_enabled').order('provider_key');
    ok(res, { data: data || [] });
  } catch (e) { err(res, e.message); }
};

exports.runCertification = async (req, res) => {
  try {
    const report = await ProviderCertificationRegistry.certify(req.params.provider);
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};

// ── Settlement Calendar ────────────────────────────────────────────────────────
exports.getSettlementCalendar = async (req, res) => {
  try {
    const data = await SettlementCalendar.getAll();
    ok(res, { data });
  } catch (e) { err(res, e.message); }
};

// ── Correlation Trace ──────────────────────────────────────────────────────────
exports.getCorrelationTrace = async (req, res) => {
  try {
    const { id } = req.params;
    const entry  = await CorrelationEngine.lookup(id);
    if (!entry) return err(res, `Correlation ID ${id} not found`, 404);

    // Fetch associated data
    const [{ data: settlementPositions }, { data: auditEvents }, { data: routingDecisions }] = await Promise.all([
      supabase.from('settlement_positions').select('*').eq('correlation_id', id),
      supabase.from('immutable_audit_log').select('*').or(`subject_id.eq.${id},metadata->correlationId.eq.${id}`).order('created_at', { ascending: true }).limit(50),
      supabase.from('routing_decisions').select('*').eq('correlation_id', id),
    ]);

    ok(res, {
      data: {
        executionLog:      entry,
        settlementPositions: settlementPositions || [],
        auditEvents:         auditEvents || [],
        routingDecisions:    routingDecisions || [],
      },
    });
  } catch (e) { err(res, e.message); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 18A: Crypto Enterprise Treasury Controllers (NOWPayments & Multi-Crypto)
// ═══════════════════════════════════════════════════════════════════════════════

const CryptoWalletInventoryService = require('../services/treasury/CryptoWalletInventoryService');
const CryptoDepositPoolService     = require('../services/payment/CryptoDepositPoolService');
const CryptoWithdrawalQueueService = require('../services/payment/CryptoWithdrawalQueueService');

exports.getCryptoOverview = async (req, res) => {
  try {
    const proof = await MultiProviderReserveEngine.getBalanceProof();
    const cryptoCurrencies = ['BTC', 'ETH', 'USDT', 'USDC'];
    const cryptoProof = {};
    for (const c of cryptoCurrencies) {
      if (proof[c]) cryptoProof[c] = proof[c];
    }
    ok(res, { data: cryptoProof });
  } catch (e) { err(res, e.message); }
};

exports.getCryptoInventory = async (req, res) => {
  try {
    const inventory = await CryptoWalletInventoryService.getInventorySummary();
    ok(res, { data: inventory });
  } catch (e) { err(res, e.message); }
};

exports.getCryptoConfirmations = async (req, res) => {
  try {
    const { data } = await supabase
      .from('deposit_confirmations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    ok(res, { data: data || [] });
  } catch (e) { err(res, e.message); }
};

exports.getCryptoWithdrawals = async (req, res) => {
  try {
    const [summary, { data: queue }] = await Promise.all([
      CryptoWithdrawalQueueService.getQueueSummary(),
      supabase.from('crypto_withdrawal_queue').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    ok(res, { summary, queue: queue || [] });
  } catch (e) { err(res, e.message); }
};

exports.getCryptoDepositPool = async (req, res) => {
  try {
    const metrics = await CryptoDepositPoolService.getPoolMetrics();
    ok(res, { data: metrics });
  } catch (e) { err(res, e.message); }
};

exports.getCryptoReconciliation = async (req, res) => {
  try {
    const { data } = await supabase
      .from('crypto_reconciliation_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(30);
    ok(res, { data: data || [] });
  } catch (e) { err(res, e.message); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 18B: Proof of Treasury & Security Governance Controllers
// ═══════════════════════════════════════════════════════════════════════════════

const ProofOfTreasuryEngine       = require('../services/treasury/ProofOfTreasuryEngine');
const SecurityGovernanceVerifier  = require('../services/payment/SecurityGovernanceVerifier');
const ReportingService            = require('../services/reporting/ReportingService');

exports.getProofOfTreasury = async (req, res) => {
  try {
    const report = await ProofOfTreasuryEngine.verifyAll();
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};

exports.getSecurityAudit = async (req, res) => {
  try {
    const audit = await SecurityGovernanceVerifier.runAudit();
    ok(res, { data: audit });
  } catch (e) { err(res, e.message); }
};

exports.getAMLReport = async (req, res) => {
  try {
    const from = req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to   = req.query.to || new Date().toISOString();
    const report = await ReportingService.generateAMLReport({ from, to, format: req.query.format });
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};

exports.getCustomerLiabilityReport = async (req, res) => {
  try {
    const report = await ReportingService.generateCustomerLiabilityReport({ format: req.query.format });
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};

exports.getProviderExposureReport = async (req, res) => {
  try {
    const report = await ReportingService.generateProviderExposureReport({ format: req.query.format });
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};

exports.getAuditExport = async (req, res) => {
  try {
    const report = await ReportingService.generateAuditExport({
      from:   req.query.from,
      to:     req.query.to,
      limit:  parseInt(req.query.limit || '500', 10),
      format: req.query.format,
    });
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 18C: Multi-Network Capability & Platform Registry Controllers
// ═══════════════════════════════════════════════════════════════════════════════

exports.getCryptoNetworks = async (req, res) => {
  try {
    const CryptoCapabilityService = require('../services/nowpayments/CryptoCapabilityService');
    const networks = await CryptoCapabilityService.getAvailableAssetsAndNetworks();
    ok(res, { data: networks });
  } catch (e) { err(res, e.message); }
};

exports.updateCryptoNetworkState = async (req, res) => {
  try {
    const { currency, network } = req.params;
    const { operational_state, disabled_reason, wallet_configured } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (operational_state !== undefined) updates.operational_state = operational_state;
    if (disabled_reason !== undefined)   updates.disabled_reason   = disabled_reason;
    if (wallet_configured !== undefined) updates.wallet_configured = wallet_configured;

    const { data, error } = await supabase
      .from('crypto_networks')
      .update(updates)
      .eq('currency', String(currency).toUpperCase())
      .eq('network', String(network).toUpperCase())
      .select()
      .single();

    if (error) return err(res, error.message);

    const ImmutableAuditLog = require('../services/treasury/ImmutableAuditLog');
    await ImmutableAuditLog.record({
      event_type:   'CRYPTO_NETWORK_STATE_UPDATED',
      actor_type:   'ADMIN',
      actor_id:     req.user?.id || 'admin',
      subject_type: 'CRYPTO_NETWORK',
      subject_id:   `${currency}_${network}`,
      reason:       `Operational state set to ${operational_state}`,
      metadata:     updates,
    });

    ok(res, { data, message: `Updated network ${currency} ${network} state.` });
  } catch (e) { err(res, e.message); }
};

exports.syncCryptoCapabilities = async (req, res) => {
  try {
    const CryptoCapabilityService = require('../services/nowpayments/CryptoCapabilityService');
    const report = await CryptoCapabilityService.syncCapabilities();
    ok(res, { data: report, message: 'Crypto capability synchronization complete.' });
  } catch (e) { err(res, e.message); }
};

exports.getProviderCapabilityReport = async (req, res) => {
  try {
    const report = await ReportingService.generateProviderCapabilityReport({ format: req.query.format });
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};

exports.getCryptoNetworkReport = async (req, res) => {
  try {
    const report = await ReportingService.generateCryptoNetworkReport({ format: req.query.format });
    ok(res, { data: report });
  } catch (e) { err(res, e.message); }
};


