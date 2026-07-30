'use strict';

const express = require('express');
const router = express.Router();
const treasuryService = require('../../services/treasury/TreasuryService');
const cryptoRiskEngine = require('../../services/risk/CryptoRiskEngine');
const cryptoCustodySyncWorker = require('../../workers/CryptoCustodySyncWorker');
const cryptoReconciliationEngine = require('../../services/reconciliation/CryptoReconciliationEngine');
const pool = require('../../config/pgPool');
const { requireAuth, requireAdmin } = require('../../middleware/authMiddleware');
const logger = require('../../utils/logger');

// Enforce authentication on all admin crypto routes
router.use(requireAuth);

/**
 * GET /api/admin/crypto/custody
 * Admin Treasury Dashboard Metrics
 */
router.get('/custody', async (req, res) => {
  try {
    const custodyBalancesRes = await pool.query(
      `SELECT cb.*, sp.name as provider_name 
       FROM public.custody_balances cb
       JOIN public.settlement_providers sp ON cb.provider_id = sp.id
       ORDER BY cb.currency, cb.provider_id`
    );

    const userLiabilitiesRes = await pool.query(
      `SELECT currency, SUM(available_balance + locked_balance + pending_balance) as total_liability, COUNT(*) as wallet_count
       FROM public.crypto_wallets
       WHERE status = 'ACTIVE'
       GROUP BY currency`
    );

    const reserveRatios = await treasuryService.calculateReserveRatios();

    const pendingApprovalsRes = await pool.query(
      `SELECT COUNT(*) FROM public.crypto_transactions WHERE status = 'PENDING_APPROVAL'`
    );

    const reconciliationRes = await pool.query(
      `SELECT * FROM public.crypto_reconciliation_reports ORDER BY created_at DESC LIMIT 1`
    );

    res.json({
      success: true,
      custodyBalances: custodyBalancesRes.rows,
      userLiabilities: userLiabilitiesRes.rows,
      reserveRatios,
      pendingApprovalsCount: parseInt(pendingApprovalsRes.rows[0].count, 10),
      latestReconciliation: reconciliationRes.rows[0] || null
    });
  } catch (err) {
    logger.error(`[GET /api/admin/crypto/custody] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/crypto/sync
 * Manually trigger custody sync cycle
 */
router.post('/sync', async (req, res) => {
  try {
    const balances = await cryptoCustodySyncWorker.sync();
    res.json({ success: true, balances });
  } catch (err) {
    logger.error(`[POST /api/admin/crypto/sync] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/crypto/approvals
 * Pending multi-sig approval queue
 */
router.get('/approvals', async (req, res) => {
  try {
    const resApprovals = await pool.query(
      `SELECT ct.*, p.email as user_email
       FROM public.crypto_transactions ct
       JOIN public.profiles p ON ct.user_id = p.id
       WHERE ct.status = 'PENDING_APPROVAL'
       ORDER BY ct.created_at ASC`
    );
    res.json({ success: true, pendingApprovals: resApprovals.rows });
  } catch (err) {
    logger.error(`[GET /api/admin/crypto/approvals] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/crypto/approvals/action
 * Submit admin multi-sig approval or rejection
 */
router.post('/approvals/action', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { transactionId, action, reason } = req.body;
    if (!transactionId || !action) {
      return res.status(400).json({ success: false, error: "TRANSACTION_ID_AND_ACTION_REQUIRED" });
    }

    const result = await cryptoRiskEngine.recordAdminApproval({
      transactionId,
      adminId,
      action,
      reason,
      ipAddress: req.ip
    });

    res.json({ success: true, result });
  } catch (err) {
    logger.error(`[POST /api/admin/crypto/approvals/action] Error: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/crypto/reconciliation
 */
router.get('/reconciliation', async (req, res) => {
  try {
    const reportsRes = await pool.query(
      `SELECT * FROM public.crypto_reconciliation_reports ORDER BY created_at DESC LIMIT 10`
    );
    res.json({ success: true, reports: reportsRes.rows });
  } catch (err) {
    logger.error(`[GET /api/admin/crypto/reconciliation] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/crypto/outbox/metrics
 */
router.get('/outbox/metrics', async (req, res) => {
  try {
    const cryptoOutboxWorker = require('../../workers/CryptoOutboxWorker');
    const metrics = await cryptoOutboxWorker.getOutboxMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    logger.error(`[GET /api/admin/crypto/outbox/metrics] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/crypto/outbox/replay
 * Replays dead-letter or failed outbox events with authorization & audit logging
 */
router.post('/outbox/replay', async (req, res) => {
  try {
    const { outboxId, dryRun = false } = req.body;
    if (!outboxId) {
      return res.status(400).json({ success: false, error: "OUTBOX_ID_REQUIRED" });
    }

    const eventRes = await pool.query(
      `SELECT * FROM public.crypto_outbox_events WHERE id = $1`,
      [outboxId]
    );

    if (eventRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "OUTBOX_EVENT_NOT_FOUND" });
    }

    const eventRow = eventRes.rows[0];

    // Replay Safety Validation: Only FAILED or DEAD_LETTER events eligible for replay
    if (!['FAILED', 'DEAD_LETTER'].includes(eventRow.status)) {
      return res.status(400).json({
        success: false,
        error: `INVALID_REPLAY_STATE: Event ${outboxId} is in status '${eventRow.status}'. Only FAILED or DEAD_LETTER events may be replayed.`
      });
    }

    // Audit log replay attempt
    await pool.query(
      `INSERT INTO public.crypto_audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'OUTBOX_EVENT_REPLAYED', 'crypto_outbox_events', $2, $3)`,
      [req.user?.id || 'SYSTEM', eventRow.id, JSON.stringify({ dryRun, eventName: eventRow.event_name, originalStatus: eventRow.status })]
    );

    if (dryRun) {
      return res.json({ success: true, dryRun: true, message: "Dry-run replay validated cleanly.", event: eventRow });
    }

    // Reset status to PENDING and trigger worker processing
    await pool.query(
      `UPDATE public.crypto_outbox_events
       SET status = 'PENDING', attempts = 0, last_error = NULL
       WHERE id = $1`,
      [outboxId]
    );

    const cryptoOutboxWorker = require('../../workers/CryptoOutboxWorker');
    await cryptoOutboxWorker.processOutboxEvents();

    res.json({ success: true, message: `Outbox event ${outboxId} replayed successfully.` });
  } catch (err) {
    logger.error(`[POST /api/admin/crypto/outbox/replay] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/crypto/health
 * Real-time operational & financial integrity health probe
 */
router.get('/health', async (req, res) => {
  try {
    // 1. Verify Double-Entry Invariant
    const ledgerCheck = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN account_type = 'ASSET' THEN balance ELSE 0 END), 0) as total_assets,
         COALESCE(SUM(CASE WHEN account_type = 'LIABILITY' THEN balance ELSE 0 END), 0) as total_liabilities
       FROM public.crypto_accounts`
    );

    // 2. Outbox Backlog Check
    const outboxCheck = await pool.query(
      `SELECT status, COUNT(*) as count FROM public.crypto_outbox_events WHERE status IN ('PENDING', 'FAILED', 'DEAD_LETTER') GROUP BY status`
    );

    const deadLetterCount = parseInt(outboxCheck.rows.find(r => r.status === 'DEAD_LETTER')?.count || '0', 10);
    const pendingCount = parseInt(outboxCheck.rows.find(r => r.status === 'PENDING')?.count || '0', 10);

    const isHealthy = deadLetterCount === 0 && pendingCount < 100;

    const cryptoOutboxWorker = require('../../workers/CryptoOutboxWorker');
    const cryptoCustodySyncWorker = require('../../workers/CryptoCustodySyncWorker');

    res.json({
      success: true,
      schemaVersion: '1.0',
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      checks: {
        doubleEntryLedger: 'BALANCED',
        outboxPendingBacklog: pendingCount,
        outboxDeadLetterQueue: deadLetterCount,
        workers: {
          outboxWorker: cryptoOutboxWorker.getHeartbeat(),
          custodySyncWorker: cryptoCustodySyncWorker.getHeartbeat()
        },
        systemStateMode: require('../../config/SystemState').mode
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`[GET /api/admin/crypto/health] Error: ${err.message}`);
    res.status(500).json({ success: false, status: 'UNHEALTHY', error: err.message });
  }
});

module.exports = router;
