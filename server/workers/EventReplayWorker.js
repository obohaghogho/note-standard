'use strict';
/**
 * EventReplayWorker.js
 * ====================
 * Disaster recovery: replays failed payment execution log entries.
 * Idempotent — safe to run multiple times.
 * Triggered manually by admin or via admin API endpoint.
 *
 * @module workers/EventReplayWorker
 */

const logger                     = require('../utils/logger');
const supabase                   = require('../config/database');
const PaymentExecutionCoordinator = require('../services/orchestration/PaymentExecutionCoordinator');

const EventReplayWorker = {
  /**
   * Replay all FAILED executions.
   * @param {number} limit  - Max records to replay per run (default: 50)
   * @returns {Promise<{ replayed, succeeded, failed, skipped }>}
   */
  async replayFailed(limit = 50) {
    logger.info(`[EventReplayWorker] Starting replay (limit: ${limit})`);

    const failedEntries = await PaymentExecutionCoordinator.getPendingReplay(limit);
    const results = { replayed: 0, succeeded: 0, failed: 0, skipped: 0 };

    for (const entry of failedEntries) {
      try {
        // Skip if max retries exceeded (default: 5)
        if ((entry.retry_count || 0) >= 5) {
          logger.warn(`[EventReplayWorker] Skipping ${entry.correlation_id} — max retries (5) reached`);
          results.skipped++;
          continue;
        }

        // Skip if already completed by a concurrent process
        const isComplete = await PaymentExecutionCoordinator.isCompleted(entry.idempotency_key);
        if (isComplete) {
          results.skipped++;
          continue;
        }

        logger.info(`[EventReplayWorker] Replaying ${entry.correlation_id} (attempt ${(entry.retry_count || 0) + 1})`);

        // Update retry count and state
        await supabase
          .from('payment_execution_log')
          .update({
            execution_state: 'INITIATED',
            retry_count:     (entry.retry_count || 0) + 1,
            last_retry_at:   new Date().toISOString(),
            error_code:      null,
            error_message:   null,
          })
          .eq('id', entry.id);

        results.replayed++;
        // Note: Actual re-execution would be handled by the CFO when called again
        // with the same idempotency key. This worker marks entries ready for retry.
        results.succeeded++;

      } catch (err) {
        logger.error(`[EventReplayWorker] Failed to replay ${entry.correlation_id}: ${err.message}`);
        results.failed++;
      }
    }

    logger.info(`[EventReplayWorker] Complete: replayed=${results.replayed} succeeded=${results.succeeded} failed=${results.failed} skipped=${results.skipped}`);
    return results;
  },

  /**
   * Replay a specific correlation ID.
   */
  async replayOne(correlationId) {
    const { data } = await supabase
      .from('payment_execution_log')
      .select('*')
      .eq('correlation_id', correlationId)
      .maybeSingle();

    if (!data) throw new Error(`Correlation ID ${correlationId} not found`);
    if (data.execution_state === 'COMPLETED') throw new Error(`${correlationId} is already COMPLETED`);

    await supabase
      .from('payment_execution_log')
      .update({
        execution_state: 'INITIATED',
        retry_count:     (data.retry_count || 0) + 1,
        last_retry_at:   new Date().toISOString(),
        error_code:      null,
        error_message:   null,
      })
      .eq('id', data.id);

    logger.info(`[EventReplayWorker] Marked ${correlationId} for replay`);
    return { correlationId, retryCount: (data.retry_count || 0) + 1 };
  },
};

module.exports = EventReplayWorker;
