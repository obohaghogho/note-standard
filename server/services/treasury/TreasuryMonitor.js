'use strict';
/**
 * TreasuryMonitor.js
 * ==================
 * Orchestrates all treasury monitoring tasks in a single cycle.
 * Called by TreasuryBalanceSyncWorker on a schedule.
 *
 * Each cycle performs:
 *   1. Sync provider balances (TreasuryService)
 *   2. Calculate reserve ratios (ReserveCalculator)
 *   3. Evaluate alerts (TreasuryAlertService)
 *   4. Compute liquidity position (LiquidityEngine)
 *   5. Compute health score (TreasuryHealth)
 *   6. Store cycle result in treasury_audit_log
 *
 * Isolation guarantee:
 *   Each step is wrapped independently. Failure in step N does not
 *   prevent steps N+1 through 5 from running.
 *
 * @module services/treasury/TreasuryMonitor
 */

const logger             = require('../../utils/logger');
const TreasuryService    = require('./TreasuryService');
const ReserveCalculator  = require('./ReserveCalculator');
const TreasuryAlertService = require('./TreasuryAlertService');
const LiquidityEngine    = require('./LiquidityEngine');
const TreasuryHealth     = require('./TreasuryHealth');
const ImmutableAuditLog  = require('./ImmutableAuditLog');

// Prevent overlapping cycles
let _cycleRunning = false;

class TreasuryMonitor {

  /**
   * Run a full monitoring cycle.
   * Safe to call from setInterval — detects and skips overlapping runs.
   *
   * @param {object} [options]
   * @param {string} [options.triggeredBy]   - 'scheduler' | 'manual:<adminId>'
   * @param {string} [options.snapshotType]  - 'SCHEDULED' | 'MANUAL' | 'BOOT'
   * @returns {Promise<object>}  Cycle summary
   */
  async runCycle(options = {}) {
    if (_cycleRunning) {
      logger.warn('[TreasuryMonitor] Previous cycle still running. Skipping this tick.');
      return { skipped: true, reason: 'CYCLE_OVERLAP' };
    }

    const { triggeredBy = 'scheduler', snapshotType = 'SCHEDULED' } = options;
    _cycleRunning = true;
    const cycleStart = Date.now();
    const summary = { steps: {}, durationMs: 0 };

    logger.info(`[TreasuryMonitor] Cycle START (triggered_by=${triggeredBy})`);

    // ── Step 1: Provider Balance Sync ───────────────────────────────────────
    try {
      const syncResult = await TreasuryService.syncAllProviders({ triggeredBy, snapshotType });
      summary.steps.sync = { ok: true, synced: syncResult.synced, failed: syncResult.failed };
    } catch (err) {
      logger.error(`[TreasuryMonitor] Step 1 (sync) failed: ${err.message}`);
      summary.steps.sync = { ok: false, error: err.message };
    }

    // ── Step 2: Reserve Calculation ─────────────────────────────────────────
    let reserveReports = {};
    try {
      reserveReports = await ReserveCalculator.calculateAll();
      const critCount = Object.values(reserveReports).filter(r => r.status === 'CRITICAL' || r.status === 'DEFICIT').length;
      summary.steps.reserve = { ok: true, currencies: Object.keys(reserveReports).length, critical: critCount };
    } catch (err) {
      logger.error(`[TreasuryMonitor] Step 2 (reserve) failed: ${err.message}`);
      summary.steps.reserve = { ok: false, error: err.message };
    }

    // ── Step 3: Alert Evaluation ─────────────────────────────────────────────
    try {
      await TreasuryAlertService.evaluateAndAlert(reserveReports);
      summary.steps.alerts = { ok: true };
    } catch (err) {
      logger.error(`[TreasuryMonitor] Step 3 (alerts) failed: ${err.message}`);
      summary.steps.alerts = { ok: false, error: err.message };
    }

    // ── Step 4: Liquidity Computation ───────────────────────────────────────
    try {
      const liquidityResults = await LiquidityEngine.computeAll();
      const gapCount = Object.values(liquidityResults).filter(r => r.has_gap).length;
      summary.steps.liquidity = { ok: true, gaps: gapCount };
    } catch (err) {
      logger.error(`[TreasuryMonitor] Step 4 (liquidity) failed: ${err.message}`);
      summary.steps.liquidity = { ok: false, error: err.message };
    }

    // ── Step 5: Health Score ─────────────────────────────────────────────────
    try {
      const health = await TreasuryHealth.computeHealthReport();
      summary.steps.health = { ok: true, grade: health.grade, score: health.score };
      summary.health = { grade: health.grade, score: health.score };
    } catch (err) {
      logger.error(`[TreasuryMonitor] Step 5 (health) failed: ${err.message}`);
      summary.steps.health = { ok: false, error: err.message };
    }

    // ── Final ────────────────────────────────────────────────────────────────
    summary.durationMs = Date.now() - cycleStart;
    _cycleRunning = false;

    logger.info(
      `[TreasuryMonitor] Cycle COMPLETE in ${summary.durationMs}ms. ` +
      `Grade: ${summary.health?.grade || 'UNKNOWN'}`
    );

    // Audit log the cycle
    ImmutableAuditLog.record({
      event_type:  'TREASURY_MONITOR_CYCLE',
      actor_type:  'WORKER',
      actor_id:    'TreasuryMonitor',
      reason:      `Monitoring cycle completed in ${summary.durationMs}ms`,
      metadata:    summary,
    }).catch(() => {});

    return summary;
  }
}

module.exports = new TreasuryMonitor();
