'use strict';
/**
 * SLAMetricsWorker.js
 * ===================
 * Hourly cron: computes SLA metrics for all providers.
 * Also detects SLA breaches and creates treasury insights.
 *
 * @module workers/SLAMetricsWorker
 */

const cron             = require('node-cron');
const logger           = require('../utils/logger');
const ProviderSLAService = require('../services/treasury/ProviderSLAService');
const supabase         = require('../config/database');

let _running = false;

const SLAMetricsWorker = {
  start() {
    // Run at the top of every hour
    cron.schedule('0 * * * *', async () => {
      if (_running) {
        logger.warn('[SLAMetricsWorker] Previous run still in progress — skipping.');
        return;
      }
      _running = true;

      try {
        const now       = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMinutes(0, 0, 0);
        const periodStart = new Date(periodEnd);
        periodStart.setHours(periodStart.getHours() - 1);

        logger.info(`[SLAMetricsWorker] Computing hourly SLA: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

        const results = await ProviderSLAService.computeAll(periodStart, periodEnd, 'HOURLY');

        // Check for SLA breaches and emit insights
        for (const [provider, metrics] of Object.entries(results)) {
          if (metrics.sla_breached) {
            logger.warn(`[SLAMetricsWorker] SLA breach: ${provider} uptime=${metrics.uptime_pct}% (target: ${metrics.sla_target_pct}%)`);

            // Insert AI insight for SLA breach
            await supabase
              .from('treasury_insights')
              .insert({
                insight_type:      'SLA_BREACH',
                severity:          metrics.uptime_pct < metrics.sla_target_pct - 1 ? 'CRITICAL' : 'WARNING',
                title:             `${provider} SLA breach: ${metrics.uptime_pct}% uptime (target: ${metrics.sla_target_pct}%)`,
                body:              `${provider} recorded ${metrics.uptime_pct}% uptime in the last hour. SLA target is ${metrics.sla_target_pct}%. Error budget remaining: ${metrics.error_budget_pct}%.`,
                recommendation:    `Review ${provider} health scores and consider reducing routing weight until provider recovers.`,
                affected_provider: provider,
                confidence:        1.0,
                status:            'ACTIVE',
                auto_expires_at:   new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                generated_at:      new Date().toISOString(),
              })
              .catch(e => logger.warn(`[SLAMetricsWorker] Insight insert failed: ${e.message}`));
          }
        }

        // Also run daily aggregate at midnight
        if (now.getHours() === 0) {
          const dayEnd   = new Date(periodEnd);
          const dayStart = new Date(dayEnd);
          dayStart.setDate(dayStart.getDate() - 1);
          await ProviderSLAService.computeAll(dayStart, dayEnd, 'DAILY');
          logger.info('[SLAMetricsWorker] Daily SLA metrics computed.');
        }

        logger.info('[SLAMetricsWorker] Hourly SLA metrics complete.');
      } catch (err) {
        logger.error(`[SLAMetricsWorker] Error: ${err.message}`);
      } finally {
        _running = false;
      }
    });

    logger.info('[SLAMetricsWorker] Scheduled (every hour).');
  },
};

module.exports = SLAMetricsWorker;
