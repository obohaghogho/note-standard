'use strict';
/**
 * reportingRoutes.js
 * ==================
 * Admin routes for regulatory and operational report generation.
 * All routes require admin authentication.
 *
 * Endpoints:
 *   POST /api/admin/reports/generate   - Generate a report
 *   GET  /api/admin/reports/types      - List available report types
 *   GET  /api/admin/reports/providers/maintenance  - Get maintenance modes
 *   POST /api/admin/reports/providers/maintenance  - Set maintenance mode
 *
 * @module routes/admin/reportingRoutes
 */

const express         = require('express');
const router          = express.Router();
const ReportingService = require('../../services/reporting/ReportingService');
const GatewayRouter   = require('../../services/payment/GatewayRouter');
const OrchestratorBridge = require('../../services/orchestration/OrchestratorBridge');
const logger          = require('../../utils/logger');

// Auth middleware (re-use existing admin guard)
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

// ─── Available report types ───────────────────────────────────────────────────

/**
 * GET /api/admin/reports/types
 * Returns supported report types with required parameters.
 */
router.get('/types', (req, res) => {
  res.json({
    types: [
      { type: 'DEPOSIT',         params: ['from', 'to', 'currency?', 'format?'] },
      { type: 'WITHDRAWAL',      params: ['from', 'to', 'currency?', 'format?'] },
      { type: 'SETTLEMENT',      params: ['from', 'to', 'format?'] },
      { type: 'RESERVE_RATIO',   params: ['date?', 'format?'] },
      { type: 'SLA',             params: ['from', 'to', 'format?'] },
      { type: 'RECONCILIATION',  params: ['runId?', 'format?'] },
    ],
    formats: ['json', 'csv'],
  });
});

// ─── Generate report ──────────────────────────────────────────────────────────

/**
 * POST /api/admin/reports/generate
 * Body: { type, from?, to?, currency?, date?, runId?, format? }
 */
router.post('/generate', async (req, res) => {
  try {
    const { type, from, to, currency, date, runId, format = 'json' } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'type is required', types: ['DEPOSIT', 'WITHDRAWAL', 'SETTLEMENT', 'RESERVE_RATIO', 'SLA', 'RECONCILIATION'] });
    }

    let report;
    const t = String(type).toUpperCase();

    switch (t) {
      case 'DEPOSIT':
        if (!from || !to) return res.status(400).json({ error: 'from and to are required for DEPOSIT reports' });
        report = await ReportingService.generateDepositReport({ from, to, currency, format });
        break;

      case 'WITHDRAWAL':
        if (!from || !to) return res.status(400).json({ error: 'from and to are required for WITHDRAWAL reports' });
        report = await ReportingService.generateWithdrawalReport({ from, to, currency, format });
        break;

      case 'SETTLEMENT':
        if (!from || !to) return res.status(400).json({ error: 'from and to are required for SETTLEMENT reports' });
        report = await ReportingService.generateSettlementReport({ from, to, format });
        break;

      case 'RESERVE_RATIO':
        report = await ReportingService.generateReserveRatioReport({ date, format });
        break;

      case 'SLA':
        if (!from || !to) return res.status(400).json({ error: 'from and to are required for SLA reports' });
        report = await ReportingService.generateSLAReport({ from, to, format });
        break;

      case 'RECONCILIATION':
        report = await ReportingService.generateReconciliationSummary({ runId, format });
        break;

      default:
        return res.status(400).json({ error: `Unknown report type: ${type}` });
    }

    // CSV response with correct content type
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${t}_report_${Date.now()}.csv"`);
      return res.send(report.csv || '');
    }

    logger.info(`[ReportingRoutes] Report generated: ${t} by admin ${req.user?.id}`);
    res.json(report);
  } catch (err) {
    logger.error(`[ReportingRoutes] Report generation failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Provider Maintenance Mode ────────────────────────────────────────────────

/**
 * GET /api/admin/reports/providers/maintenance
 * Returns current maintenance mode for all providers.
 */
router.get('/providers/maintenance', (req, res) => {
  try {
    const modes = GatewayRouter.getAllMaintenanceModes();
    res.json({ maintenance_modes: modes, retrieved_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/reports/providers/maintenance
 * Body: { provider, mode }
 * Sets maintenance mode for a provider (runtime — does not persist to DB).
 */
router.post('/providers/maintenance', (req, res) => {
  try {
    const { provider, mode } = req.body;
    if (!provider || !mode) {
      return res.status(400).json({ error: 'provider and mode are required', valid_modes: ['ACTIVE', 'MAINTENANCE', 'READ_ONLY', 'DRAIN_ONLY'] });
    }
    GatewayRouter.setMaintenanceMode(provider, mode);
    logger.warn(`[ReportingRoutes] Maintenance mode set: ${provider} → ${mode} by admin ${req.user?.id}`);
    res.json({ success: true, provider, mode, updated_at: new Date().toISOString() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Migration Status ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/reports/migration-status
 * Returns which payment flows are currently routed through the FinancialOrchestrator.
 */
router.get('/migration-status', (req, res) => {
  res.json({
    migration: OrchestratorBridge.getMigrationStatus(),
    flags: {
      MIGRATE_DEPOSITS:  process.env.MIGRATE_DEPOSITS  || 'false',
      MIGRATE_PAYOUTS:   process.env.MIGRATE_PAYOUTS   || 'false',
      MIGRATE_SWAPS:     process.env.MIGRATE_SWAPS     || 'false',
      MIGRATE_TRANSFERS: process.env.MIGRATE_TRANSFERS || 'false',
      MIGRATE_REFUNDS:   process.env.MIGRATE_REFUNDS   || 'false',
    },
    note: 'Set env flags to true to route flows through FinancialOrchestrator. Rollback: set to false (no redeploy needed).',
    retrieved_at: new Date().toISOString(),
  });
});

module.exports = router;
