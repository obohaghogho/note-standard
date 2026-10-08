'use strict';
/**
 * DailyCreatorAnalyticsWorker.js
 * =================================
 * Cron worker: runs daily at 02:00 UTC to compute creator learning analytics
 * snapshots for the previous completed UTC date.
 *
 * @module workers/DailyCreatorAnalyticsWorker
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const supabase = require('../config/database');

let _running = false;

const DailyCreatorAnalyticsWorker = {
  start() {
    // 02:00 AM UTC daily
    cron.schedule('0 2 * * *', async () => {
      if (_running) {
        logger.warn('[DailyCreatorAnalyticsWorker] Previous run in progress — skipping.');
        return;
      }
      _running = true;

      const targetDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      logger.info(`[DailyCreatorAnalyticsWorker] Starting daily creator analytics calculation for ${targetDate}...`);

      try {
        const { error } = await supabase.rpc('generate_daily_creator_analytics', {
          p_snapshot_date: targetDate
        });

        if (error) {
          logger.error(`[DailyCreatorAnalyticsWorker] RPC error for ${targetDate}: ${error.message}`);
        } else {
          logger.info(`[DailyCreatorAnalyticsWorker] Completed snapshot calculation for ${targetDate}.`);
        }
      } catch (err) {
        logger.error(`[DailyCreatorAnalyticsWorker] Exception during snapshot generation for ${targetDate}: ${err.message}`);
      } finally {
        _running = false;
      }
    }, { timezone: 'UTC' });

    logger.info('[DailyCreatorAnalyticsWorker] Scheduled (02:00 UTC daily).');
  },

  /**
   * Trigger a manual analytics snapshot generation for a specific target date (YYYY-MM-DD).
   * Defaults to yesterday's UTC date if omitted.
   */
  async runNow(targetDateStr) {
    if (_running) throw new Error('DailyCreatorAnalyticsWorker is already running.');
    _running = true;

    const targetDate = targetDateStr || new Date(Date.now() - 86400000).toISOString().split('T')[0];
    logger.info(`[DailyCreatorAnalyticsWorker] Executing manual run for ${targetDate}...`);

    try {
      const { error } = await supabase.rpc('generate_daily_creator_analytics', {
        p_snapshot_date: targetDate
      });

      if (error) {
        logger.error(`[DailyCreatorAnalyticsWorker] Manual RPC error for ${targetDate}: ${error.message}`);
        throw error;
      }

      logger.info(`[DailyCreatorAnalyticsWorker] Manual run completed for ${targetDate}.`);
      return { success: true, snapshot_date: targetDate };
    } finally {
      _running = false;
    }
  }
};

module.exports = DailyCreatorAnalyticsWorker;
