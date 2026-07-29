'use strict';
/**
 * LiquidityForecastWorker.js
 * ==========================
 * Runs the LiquidityEngine for all currencies every 10 minutes.
 * Writes OPEN recommendations to liquidity_recommendations.
 * Resolves recommendations that are no longer active.
 *
 * @module workers/LiquidityForecastWorker
 */

const logger          = require('../utils/logger');
const supabase        = require('../config/database');
const LiquidityEngine  = require('../services/treasury/LiquidityEngine');
const ImmutableAuditLog = require('../services/treasury/ImmutableAuditLog');

const INTERVAL_MS   = parseInt(process.env.LIQUIDITY_INTERVAL_MS || '600000', 10); // 10 min
const BOOT_DELAY_MS = 60000; // 60s

let _intervalHandle = null;
let _running        = false;

const LiquidityForecastWorker = {
  name: 'LiquidityForecastWorker',

  start() {
    if (_running) return;
    _running = true;
    logger.info(`[LiquidityForecastWorker] Starting. Interval: ${INTERVAL_MS / 1000}s`);

    setTimeout(() => {
      this._runSafe();
      _intervalHandle = setInterval(() => this._runSafe(), INTERVAL_MS);
    }, BOOT_DELAY_MS);
  },

  stop() {
    if (_intervalHandle) clearInterval(_intervalHandle);
    _running = false;
    logger.info('[LiquidityForecastWorker] Stopped.');
  },

  async _runSafe() {
    try {
      const results = await LiquidityEngine.computeAll();
      const gaps    = Object.values(results).filter(r => r.has_gap).length;

      if (gaps > 0) {
        logger.warn(`[LiquidityForecastWorker] ${gaps} currency/currencies have liquidity gaps.`);
      }

      // Auto-resolve stale recommendations (older than 1 hour with no gap)
      await this._resolveStaleRecommendations(results);

      ImmutableAuditLog.record({
        event_type: 'LIQUIDITY_FORECAST_CYCLE',
        actor_type: 'WORKER',
        actor_id:   'LiquidityForecastWorker',
        reason:     `Forecast cycle complete. Gaps: ${gaps}`,
        metadata:   { gaps, currencies: Object.keys(results).length },
      }).catch(() => {});

    } catch (err) {
      logger.error(`[LiquidityForecastWorker] Cycle error: ${err.message}`);
    }
  },

  async _resolveStaleRecommendations(latestResults) {
    // Get all OPEN recommendations
    const { data: openRecs } = await supabase
      .from('liquidity_recommendations')
      .select('id, currency, recommendation_type')
      .eq('status', 'OPEN');

    if (!openRecs || openRecs.length === 0) return;

    for (const rec of openRecs) {
      const latest = latestResults[rec.currency];
      // If the latest liquidity result for this currency shows no gap, auto-resolve
      if (latest && !latest.has_gap && latest.severity === 'OK') {
        await supabase
          .from('liquidity_recommendations')
          .update({
            status:      'RESOLVED',
            resolved_at: new Date().toISOString(),
          })
          .eq('id', rec.id)
          .catch(e => logger.warn(`[LiquidityForecastWorker] Auto-resolve failed: ${e.message}`));
      }
    }
  },
};

module.exports = LiquidityForecastWorker;
