'use strict';

/**
 * LiquidityReconciliationWorker.js
 * ================================
 * Background Reconciliation Poller for Decoupled Conversion Orders.
 *
 * Responsibilities:
 *   1. Polls pending conversion orders (`LIQUIDITY_PENDING`).
 *   2. Re-evaluates approved liquidity routes.
 *   3. Automatically resumes conversion execution when a valid route opens.
 *   4. Reclaims expired liquidity reservations in `treasury_liquidity_reservations`.
 */

const supabase = require('../config/database');
const logger   = require('../utils/logger');
const conversionService = require('../services/conversionService');

class LiquidityReconciliationWorker {
  async processPendingConversions() {
    logger.info('[LiquidityReconciliationWorker] Polling for pending conversion orders (LIQUIDITY_PENDING)...');

    // 1. Fetch pending orders
    const { data: pendingOrders, error } = await supabase
      .from('conversion_orders')
      .select('conversion_id')
      .eq('status', 'LIQUIDITY_PENDING')
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) {
      logger.error(`[LiquidityReconciliationWorker] Error querying pending orders: ${error.message}`);
      return { processed: 0, retried: 0 };
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      return { processed: 0, retried: 0 };
    }

    let retried = 0;
    for (const item of pendingOrders) {
      try {
        logger.info(`[LiquidityReconciliationWorker] Re-evaluating pending conversion ${item.conversion_id}...`);
        const res = await conversionService.processConversionRouting(item.conversion_id);
        if (res && res.success) {
          retried++;
          logger.info(`[LiquidityReconciliationWorker] Successfully resumed conversion ${item.conversion_id}! Status: ${res.status}`);
        }
      } catch (err) {
        logger.warn(`[LiquidityReconciliationWorker] Retry attempt for ${item.conversion_id} did not complete: ${err.message}`);
      }
    }

    // 2. Reclaim expired reservations
    await this.cleanupExpiredReservations();

    return { processed: pendingOrders.length, retried };
  }

  async cleanupExpiredReservations() {
    try {
      const { data, error } = await supabase
        .from('treasury_liquidity_reservations')
        .update({ status: 'EXPIRED' })
        .eq('status', 'SOURCE_RESERVED')
        .lt('expires_at', new Date().toISOString())
        .select();

      if (!error && data && data.length > 0) {
        logger.info(`[LiquidityReconciliationWorker] Cleaned up ${data.length} expired liquidity reservations.`);
      }
    } catch (err) {
      logger.error(`[LiquidityReconciliationWorker] Exception cleaning up reservations: ${err.message}`);
    }
  }
}

module.exports = new LiquidityReconciliationWorker();
