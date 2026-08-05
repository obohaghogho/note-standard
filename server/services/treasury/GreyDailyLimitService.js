'use strict';

const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const notificationService = require('../notificationService');

/**
 * GreyDailyLimitService
 * =====================
 * Enterprise Daily Settlement Limit Protection Engine.
 *
 * Operational Constraint:
 *  - Grey currently enforces a daily settlement volume limit of $100,000 USD equivalent.
 *  - System tracks cumulative daily settlement volume across all payouts.
 *  - Administrative notifications are emitted at 50%, 75%, 90%, 95%, and 100% utilization.
 *  - Prevents initiating payouts that exceed available settlement capacity.
 */
class GreyDailyLimitService {
  constructor() {
    this.DAILY_LIMIT_USD = 100000.0;
    this.ALERT_THRESHOLDS = [50, 75, 90, 95, 100];
    this.triggeredThresholdsToday = new Set();
    this.lastResetDate = new Date().toISOString().split('T')[0];
  }

  _checkDateReset() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastResetDate !== today) {
      logger.info(`[GreyDailyLimitService] New settlement day (${today}) — resetting alert thresholds`);
      this.triggeredThresholdsToday.clear();
      this.lastResetDate = today;
    }
  }

  /**
   * Get current daily settlement volume in USD equivalent
   */
  async getTodaySettlementVolumeUsd() {
    this._checkDateReset();
    const todayStart = `${this.lastResetDate}T00:00:00.000Z`;

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, currency')
        .eq('provider', 'grey')
        .in('status', ['COMPLETED', 'PROCESSING', 'PENDING'])
        .gte('created_at', todayStart);

      if (error) {
        logger.error(`[GreyDailyLimitService] Volume query failed: ${error.message}`);
        return 0.0;
      }

      // Convert each transaction to USD equivalent (1 NGN ~ 0.00067 USD fallback or simple conversion)
      let totalUsd = 0.0;
      for (const tx of data || []) {
        const amt = Number(tx.amount || 0);
        const curr = String(tx.currency || 'USD').toUpperCase();
        
        let usdVal = amt;
        if (curr === 'NGN') usdVal = amt / 1500; // NGN to USD approximation
        else if (curr === 'EUR') usdVal = amt * 1.08;
        else if (curr === 'GBP') usdVal = amt * 1.27;

        totalUsd += usdVal;
      }

      return totalUsd;
    } catch (err) {
      logger.error(`[GreyDailyLimitService] Exception getting volume: ${err.message}`);
      return 0.0;
    }
  }

  /**
   * Check if a requested payout amount can be settled under today's limit
   */
  async checkSettlementCapacity(amount, currency = 'USD') {
    const currentVolumeUsd = await this.getTodaySettlementVolumeUsd();
    
    let reqUsd = Number(amount);
    const curr = String(currency).toUpperCase();
    if (curr === 'NGN') reqUsd = reqUsd / 1500;
    else if (curr === 'EUR') reqUsd = reqUsd * 1.08;
    else if (curr === 'GBP') reqUsd = reqUsd * 1.27;

    const projectedVolumeUsd = currentVolumeUsd + reqUsd;
    const remainingCapacityUsd = Math.max(0, this.DAILY_LIMIT_USD - currentVolumeUsd);
    const utilizationPercentage = Math.min(100, Number(((currentVolumeUsd / this.DAILY_LIMIT_USD) * 100).toFixed(1)));
    const projectedPercentage = Math.min(100, Number(((projectedVolumeUsd / this.DAILY_LIMIT_USD) * 100).toFixed(1)));

    const isAvailable = projectedVolumeUsd <= this.DAILY_LIMIT_USD;

    return {
      isAvailable,
      dailyLimitUsd: this.DAILY_LIMIT_USD,
      currentVolumeUsd: Number(currentVolumeUsd.toFixed(2)),
      remainingCapacityUsd: Number(remainingCapacityUsd.toFixed(2)),
      utilizationPercentage,
      projectedPercentage,
      requestedAmountUsd: Number(reqUsd.toFixed(2)),
      message: isAvailable 
        ? 'Settlement capacity available'
        : `Daily settlement capacity ($100,000 USD limit) reached. Current utilization: ${utilizationPercentage}%.`
    };
  }

  /**
   * Record a settlement transaction and check threshold alerts
   */
  async recordSettlement(amount, currency, reference) {
    const capacity = await this.checkSettlementCapacity(0, currency);
    const util = capacity.utilizationPercentage;

    for (const threshold of this.ALERT_THRESHOLDS) {
      if (util >= threshold && !this.triggeredThresholdsToday.has(threshold)) {
        this.triggeredThresholdsToday.add(threshold);
        await this._triggerThresholdAlert(threshold, capacity, reference);
      }
    }
  }

  /**
   * Send threshold alert to administrators
   */
  async _triggerThresholdAlert(threshold, capacity, reference) {
    const alertMsg = `⚠️ [ALERT] Grey Settlement Capacity reached ${threshold}% utilization ($${capacity.currentVolumeUsd.toLocaleString()} / $100,000 USD). Remaining capacity: $${capacity.remainingCapacityUsd.toLocaleString()} USD.`;
    logger.warn(alertMsg, { reference, capacity });

    try {
      // Notify system admins via notification service & audit log
      await notificationService.notifyAdmins({
        title: `Grey Daily Settlement Limit Alert (${threshold}%)`,
        message: alertMsg,
        type: 'SYSTEM_ALERT',
        data: { threshold, capacity, reference }
      }).catch(() => {});

      // Insert into alert_events table if present
      await supabase.from('alert_events').insert({
        title: `Grey Daily Limit ${threshold}% Utilized`,
        severity: threshold >= 90 ? 'CRITICAL' : 'WARNING',
        message: alertMsg,
        details: capacity
      }).catch(() => {});
    } catch (e) {
      logger.warn(`[GreyDailyLimitService] Admin alert dispatch warning: ${e.message}`);
    }
  }
}

module.exports = new GreyDailyLimitService();
