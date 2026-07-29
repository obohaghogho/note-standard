'use strict';
/**
 * treasuryRoutes.js
 * =================
 * All treasury admin routes.
 * Every route is protected by requireAdmin middleware inherited
 * from the parent router in routes/admin.js.
 *
 * Route namespace: /api/admin/treasury/...
 *
 * Mount in routes/admin.js with:
 *   const treasuryRoutes = require('./admin/treasuryRoutes');
 *   router.use('/treasury', treasuryRoutes);
 *
 * @module routes/admin/treasuryRoutes
 */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../../controllers/treasuryDashboardController');

// ── Overview ──────────────────────────────────────────────────────────────────
// GET /api/admin/treasury/dashboard        Full dashboard payload
// GET /api/admin/treasury/summary          Quick header summary (fast)
// GET /api/admin/treasury/metrics          Observability metrics
router.get('/dashboard',  ctrl.getDashboard);
router.get('/summary',    ctrl.getQuickSummary);
router.get('/metrics',    ctrl.getMetrics);

// ── Reserve Ratios ────────────────────────────────────────────────────────────
// GET /api/admin/treasury/reserves                   Latest ratios (all currencies)
// GET /api/admin/treasury/reserves/:currency/history Reserve history (charts)
router.get('/reserves',                      ctrl.getReserveRatios);
router.get('/reserves/:currency/history',    ctrl.getReserveHistory);

// ── Provider Balances ─────────────────────────────────────────────────────────
// GET /api/admin/treasury/balances                         Latest synced balances
// GET /api/admin/treasury/balances/:provider/:currency/snapshots  Snapshot history
// POST /api/admin/treasury/sync                            Trigger manual sync
router.get('/balances',                                  ctrl.getProviderBalances);
router.get('/balances/:provider/:currency/snapshots',    ctrl.getSnapshotHistory);
router.post('/sync',                                     ctrl.triggerSync);

// ── Provider Health ───────────────────────────────────────────────────────────
// GET /api/admin/treasury/providers/health              All provider status
// GET /api/admin/treasury/providers/:provider/probes    Probe history
router.get('/providers/health',              ctrl.getProviderHealth);
router.get('/providers/:provider/probes',    ctrl.getProbeHistory);

// ── Settlements ───────────────────────────────────────────────────────────────
// GET  /api/admin/treasury/settlements          List settlements (filterable)
// GET  /api/admin/treasury/settlements/:id      Detail + transition history
router.get('/settlements',       ctrl.getSettlements);
router.get('/settlements/:id',   ctrl.getSettlementDetail);

// ── Treasury Transfers ────────────────────────────────────────────────────────
// GET  /api/admin/treasury/transfers                    List transfers
// POST /api/admin/treasury/transfers                    Request new transfer
// POST /api/admin/treasury/transfers/:id/approve        Approve transfer
// POST /api/admin/treasury/transfers/:id/cancel         Cancel transfer
router.get('/transfers',                     ctrl.getTransfers);
router.post('/transfers',                    ctrl.requestTransfer);
router.post('/transfers/:id/approve',        ctrl.approveTransfer);
router.post('/transfers/:id/execute',        ctrl.executeTransfer);
router.post('/transfers/:id/cancel',         ctrl.cancelTransfer);

// ── Liquidity ─────────────────────────────────────────────────────────────────
// GET /api/admin/treasury/liquidity                   Current liquidity report
// GET /api/admin/treasury/liquidity/recommendations   Open recommendations
router.get('/liquidity',                     ctrl.getLiquidityReport);
router.get('/liquidity/recommendations',     ctrl.getLiquidityRecommendations);

// ── FX Positions ──────────────────────────────────────────────────────────────
// GET /api/admin/treasury/fx/exposure      Today's exposure summary
// GET /api/admin/treasury/fx/trades        Recent trades
router.get('/fx/exposure',   ctrl.getFXExposure);
router.get('/fx/trades',     ctrl.getRecentFXTrades);

// ── Audit Log ─────────────────────────────────────────────────────────────────
// GET /api/admin/treasury/audit             Query audit events
// GET /api/admin/treasury/audit/chain       Verify chain integrity
router.get('/audit',          ctrl.getAuditEvents);
router.get('/audit/chain',    ctrl.verifyAuditChain);

// ── Phase 16: Routing Engine ──────────────────────────────────────────────────
// GET /api/admin/treasury/routing/stats          Routing decision analytics
// GET /api/admin/treasury/routing/policies        Active routing policies
// GET /api/admin/treasury/routing/health-scores   Numerical provider scores
router.get('/routing/stats',          ctrl.getRoutingStats);
router.get('/routing/policies',       ctrl.getRoutingPolicies);
router.get('/routing/health-scores',  ctrl.getProviderHealthScores);

// ── Phase 16: Rebalancing ─────────────────────────────────────────────────────
// GET  /api/admin/treasury/rebalancing/recommendations   Open recommendations
// POST /api/admin/treasury/rebalancing/:id/acknowledge   Acknowledge one
router.get('/rebalancing/recommendations',         ctrl.getRebalancingRecommendations);
router.post('/rebalancing/:id/acknowledge',        ctrl.acknowledgeRebalancing);

// ── Phase 16: AI Insights ─────────────────────────────────────────────────────
// GET  /api/admin/treasury/insights                Active AI monitor insights
// POST /api/admin/treasury/insights/:id/acknowledge Acknowledge an insight
router.get('/insights',                    ctrl.getAIInsights);
router.post('/insights/:id/acknowledge',   ctrl.acknowledgeInsight);

// ── Phase 16: SLA Monitoring ──────────────────────────────────────────────────
// GET /api/admin/treasury/sla/dashboard              All provider SLA summary
// GET /api/admin/treasury/sla/:provider/history      Provider SLA history
router.get('/sla/dashboard',                 ctrl.getSLADashboard);
router.get('/sla/:provider/history',         ctrl.getSLAHistory);

// ── Phase 16: Forecasts ───────────────────────────────────────────────────────
// GET /api/admin/treasury/forecasts              Latest 24h/72h/7d forecasts
// GET /api/admin/treasury/forecasts/:currency    Currency-specific forecasts
router.get('/forecasts',                     ctrl.getTreasuryForecasts);
router.get('/forecasts/:currency',           ctrl.getCurrencyForecast);

// ── Phase 16: Balance Proof ───────────────────────────────────────────────────
// GET /api/admin/treasury/balance-proof          Customer liability vs. assets
router.get('/balance-proof',                 ctrl.getBalanceProof);

// ── Phase 16: Settlement Pipeline ────────────────────────────────────────────
// GET /api/admin/treasury/settlement-pipeline        Per-provider pipeline summary
// GET /api/admin/treasury/settlement-pipeline/stuck  Overdue settlements
router.get('/settlement-pipeline',           ctrl.getSettlementPipeline);
router.get('/settlement-pipeline/stuck',     ctrl.getStuckSettlements);

// ── Phase 16: Reconciliation ──────────────────────────────────────────────────
// GET  /api/admin/treasury/reconciliation/runs         List recent runs
// POST /api/admin/treasury/reconciliation/trigger      Trigger manual run
// GET  /api/admin/treasury/reconciliation/runs/:id     Run detail + line items
router.get('/reconciliation/runs',           ctrl.getReconciliationRuns);
router.post('/reconciliation/trigger',       ctrl.triggerReconciliation);
router.get('/reconciliation/runs/:id',       ctrl.getReconciliationRunDetail);

// ── Phase 16: Stress Simulator ────────────────────────────────────────────────
// POST /api/admin/treasury/stress/simulate   Run a simulation scenario
router.post('/stress/simulate',              ctrl.runStressSimulation);

// ── Phase 16: Event Replay ────────────────────────────────────────────────────
// GET  /api/admin/treasury/replay/pending         List FAILED executions
// POST /api/admin/treasury/replay                 Replay all failed
// POST /api/admin/treasury/replay/:correlationId  Replay one
router.get('/replay/pending',                ctrl.getReplayQueue);
router.post('/replay',                       ctrl.replayFailed);
router.post('/replay/:correlationId',        ctrl.replayOne);

// ── Phase 16: Provider Certification ─────────────────────────────────────────
// GET  /api/admin/treasury/certification/status        All provider cert status
// POST /api/admin/treasury/certification/:provider     Run certification check
router.get('/certification/status',                  ctrl.getCertificationStatus);
router.post('/certification/:provider',              ctrl.runCertification);

// ── Phase 16: Settlement Calendar ────────────────────────────────────────────
// GET /api/admin/treasury/settlement-calendar          All settlement models
router.get('/settlement-calendar',           ctrl.getSettlementCalendar);

// ── Phase 16: Correlation Lookup ─────────────────────────────────────────────
// GET /api/admin/treasury/correlation/:id    Full correlation trace
router.get('/correlation/:id',               ctrl.getCorrelationTrace);

// ── Phase 17: Exposure Limits ────────────────────────────────────────────────
// POST /api/admin/treasury/exposure/check    Enforce exposure limits across currencies
router.post('/exposure/check', async (req, res) => {
  try {
    const MultiProviderReserveEngine = require('../../services/treasury/MultiProviderReserveEngine');
    const result = await MultiProviderReserveEngine.enforceExposureLimits(req.body.currency);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 17: Full Stress Simulation Suite ───────────────────────────────────
// POST /api/admin/treasury/stress/full   Run all 5 scenarios at once
router.post('/stress/full', async (req, res) => {
  try {
    const TreasuryStressSimulator = require('../../services/treasury/TreasuryStressSimulator');
    const { currency = 'NGN', ...overrides } = req.body;
    const report = await TreasuryStressSimulator.runAll(currency, overrides);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 17: Webhook Replay ─────────────────────────────────────────────────
// GET  /api/admin/treasury/webhooks/summary          Event summary by status/provider
// POST /api/admin/treasury/webhooks/replay           Replay events matching filter
router.get('/webhooks/summary', async (req, res) => {
  try {
    const WebhookReplayService = require('../../services/payment/WebhookReplayService');
    const result = await WebhookReplayService.getSummary({ from: req.query.from, to: req.query.to });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/webhooks/replay', async (req, res) => {
  try {
    const WebhookReplayService = require('../../services/payment/WebhookReplayService');
    const result = await WebhookReplayService.replay({
      ...req.body,
      requestedBy: req.user?.id || 'admin',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 17: Versioned Policy Management ───────────────────────────────────
// GET  /api/admin/treasury/policies/:name/history   Version history for a policy
// POST /api/admin/treasury/policies                 Create versioned policy
// DELETE /api/admin/treasury/policies/:id           Retire a policy version
router.get('/policies/:name/history', async (req, res) => {
  try {
    const PolicyEngine = require('../../services/orchestration/PaymentPolicyEngine');
    const history = await PolicyEngine.getPolicyHistory(req.params.name);
    res.json({ policy_name: req.params.name, versions: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/policies', async (req, res) => {
  try {
    const PolicyEngine = require('../../services/orchestration/PaymentPolicyEngine');
    const policy = await PolicyEngine.createVersionedPolicy(req.body, req.user?.id);
    res.status(201).json(policy);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/policies/:id', async (req, res) => {
  try {
    const PolicyEngine = require('../../services/orchestration/PaymentPolicyEngine');
    await PolicyEngine.retirePolicy(req.params.id, req.user?.id);
    res.json({ success: true, retired_id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 17: Provider Capability Discovery ──────────────────────────────────
// GET  /api/admin/treasury/capabilities               Discover all provider capabilities
// GET  /api/admin/treasury/capabilities/:provider     Single provider capabilities
// POST /api/admin/treasury/capabilities/:provider/refresh  Force cache refresh
router.get('/capabilities', async (req, res) => {
  try {
    const ProviderCapabilityService = require('../../services/payment/ProviderCapabilityService');
    const caps = await ProviderCapabilityService.discoverAll();
    res.json({ capabilities: caps, retrieved_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/capabilities/:provider', async (req, res) => {
  try {
    const ProviderCapabilityService = require('../../services/payment/ProviderCapabilityService');
    const cap = await ProviderCapabilityService.discover(req.params.provider);
    if (!cap) return res.status(404).json({ error: `Provider ${req.params.provider} not found` });
    res.json(cap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/capabilities/:provider/refresh', async (req, res) => {
  try {
    const ProviderCapabilityService = require('../../services/payment/ProviderCapabilityService');
    const cap = await ProviderCapabilityService.refresh(req.params.provider);
    res.json({ refreshed: true, ...cap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 17: Environment Isolation Audit ───────────────────────────────────
// GET /api/admin/treasury/environment/audit   Provider environment isolation report
router.get('/environment/audit', (req, res) => {
  try {
    const EnvironmentGuard = require('../../services/payment/EnvironmentGuard');
    res.json(EnvironmentGuard.auditAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 17: Transaction Lifecycle ─────────────────────────────────────────
// GET  /api/admin/treasury/lifecycle/:correlationId/state    Current lifecycle state
// POST /api/admin/treasury/lifecycle/expire-stale            Expire stale transactions
router.get('/lifecycle/:correlationId/state', async (req, res) => {
  try {
    const TransactionLifecycle = require('../../services/orchestration/TransactionLifecycle');
    const isTerminal = await TransactionLifecycle.isTerminal(req.params.correlationId);
    res.json({ correlationId: req.params.correlationId, isTerminal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/lifecycle/expire-stale', async (req, res) => {
  try {
    const TransactionLifecycle = require('../../services/orchestration/TransactionLifecycle');
    const results = await TransactionLifecycle.expireStale(req.body.ttlHours || 24);
    res.json({ expired: results.filter(r => r.success).length, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Phase 18A: Crypto Enterprise Dashboard ──────────────────────────────────
// GET /api/admin/treasury/crypto/overview        Crypto liabilities vs assets & proof of reserves
// GET /api/admin/treasury/crypto/inventory       Hot/Warm/Cold wallet breakdown
// GET /api/admin/treasury/crypto/confirmations   Blockchain deposit confirmation queue
// GET /api/admin/treasury/crypto/withdrawals     Crypto payout queue & status
// GET /api/admin/treasury/crypto/deposit-pool    Address pool metrics & state counts
// GET /api/admin/treasury/crypto/reconciliation  Nightly crypto reconciliation reports
router.get('/crypto/overview',       ctrl.getCryptoOverview);
router.get('/crypto/inventory',      ctrl.getCryptoInventory);
router.get('/crypto/confirmations',  ctrl.getCryptoConfirmations);
router.get('/crypto/withdrawals',    ctrl.getCryptoWithdrawals);
router.get('/crypto/deposit-pool',   ctrl.getCryptoDepositPool);
router.get('/crypto/reconciliation', ctrl.getCryptoReconciliation);

// ── Phase 18B: Proof of Treasury & Regulatory Security Governance ────────────
// GET /api/admin/treasury/proof-of-treasury     Real-time audit comparing Assets vs Liabilities
// GET /api/admin/treasury/security/audit        Webhook, Idempotency, and Audit Log security check
// GET /api/admin/treasury/reports/aml           AML monitoring report
// GET /api/admin/treasury/reports/liability     Customer liability summary
// GET /api/admin/treasury/reports/exposure      Provider exposure concentration summary
// GET /api/admin/treasury/reports/audit-export  Immutable audit log export
router.get('/proof-of-treasury',     ctrl.getProofOfTreasury);
router.get('/security/audit',        ctrl.getSecurityAudit);
router.get('/reports/aml',           ctrl.getAMLReport);
router.get('/reports/liability',     ctrl.getCustomerLiabilityReport);
router.get('/reports/exposure',      ctrl.getProviderExposureReport);
router.get('/reports/audit-export',  ctrl.getAuditExport);

module.exports = router;
