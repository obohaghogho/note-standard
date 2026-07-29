'use strict';
/**
 * TreasuryAlertService.js
 * =======================
 * Generates and dispatches treasury alerts through all
 * configured notification channels (email, admin notification,
 * SystemState transitions).
 *
 * Alert escalation tiers:
 *   INFO     → dashboard only
 *   WARN     → dashboard + admin email
 *   CRITICAL → dashboard + admin email + SystemState.setWithdrawalMode('DEGRADED')
 *   FREEZE   → dashboard + admin email + SystemState.setWithdrawalMode('FROZEN')
 *
 * Design rules:
 *   - A single transient API timeout NEVER triggers FREEZE
 *   - FREEZE requires N consecutive CRITICAL alerts above configured threshold
 *   - All alerts are recorded in treasury_audit_log
 *   - Alert deduplication: same currency + same level within 15 minutes = skip
 *
 * @module services/treasury/TreasuryAlertService
 */

const supabase     = require('../../config/database');
const logger       = require('../../utils/logger');
const SystemState  = require('../../config/SystemState');

// Minimum consecutive critical cycles before triggering FREEZE
const FREEZE_CONSECUTIVE_THRESHOLD = 3;

// Deduplication window in ms (15 minutes)
const DEDUP_WINDOW_MS = 15 * 60 * 1000;

// In-memory counters for consecutive critical alerts per currency
// Resets when system restarts (intentional — prevents ghost freeze on restart)
const _consecutiveCritical = {};
const _lastAlertTime       = {};

class TreasuryAlertService {

  // ── 1. Evaluate Reserve Ratios and Send Alerts ───────────────────────────

  /**
   * Main entry point. Called by ReserveCalculator after computing ratios.
   *
   * @param {Array<object>} ratioReports  - Results from ReserveCalculator.calculateAll()
   */
  async evaluateAndAlert(ratioReports) {
    for (const report of Object.values(ratioReports)) {
      if (!report || report.status === 'ERROR') continue;
      try {
        await this._processReport(report);
      } catch (err) {
        logger.error(`[TreasuryAlertService] Failed to process alert for ${report.currency}: ${err.message}`);
      }
    }
  }

  // ── 2. Send a Manual Alert ────────────────────────────────────────────────

  /**
   * Allows code outside this service to trigger a treasury alert directly.
   *
   * @param {object} params
   * @param {string} params.type     - Alert type key
   * @param {string} params.level    - 'INFO' | 'WARN' | 'CRITICAL'
   * @param {string} params.title    - Short alert title
   * @param {string} params.message  - Full alert message
   * @param {string} [params.currency]
   * @param {string} [params.provider]
   * @param {object} [params.metadata]
   */
  async sendAlert({ type, level, title, message, currency, provider, metadata = {} }) {
    logger.warn(`[TreasuryAlertService] ALERT [${level}] ${title}: ${message}`);

    // Write to treasury audit log
    await this._writeAuditLog({
      event_type:   `TREASURY_ALERT_${level}`,
      event_subtype: type,
      currency,
      provider,
      reason:       message,
      metadata:     { title, ...metadata },
    });

    // Notify admins via email (fire-and-forget)
    if (level === 'WARN' || level === 'CRITICAL') {
      this._notifyAdmins({ title, message, level, currency, provider }).catch(err =>
        logger.error(`[TreasuryAlertService] Admin notification failed: ${err.message}`)
      );
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _processReport(report) {
    const { currency, status, reserve_ratio, alert_level } = report;
    if (!alert_level) {
      // Reset consecutive counter on recovery
      _consecutiveCritical[currency] = 0;
      return;
    }

    // Deduplication check
    const lastKey = `${currency}:${alert_level}`;
    const lastTime = _lastAlertTime[lastKey] || 0;
    if (Date.now() - lastTime < DEDUP_WINDOW_MS) {
      logger.info(`[TreasuryAlertService] Dedup skip: ${lastKey} (last sent ${Math.round((Date.now() - lastTime) / 1000)}s ago)`);
      if (alert_level === 'CRITICAL') {
        _consecutiveCritical[currency] = (_consecutiveCritical[currency] || 0) + 1;
        await this._checkFreezeThreshold(currency, reserve_ratio);
      }
      return;
    }

    _lastAlertTime[lastKey] = Date.now();

    const title   = this._buildTitle(currency, status, reserve_ratio);
    const message = this._buildMessage(report);

    logger.warn(`[TreasuryAlertService] [${alert_level}] ${title}`);

    // Audit log
    await this._writeAuditLog({
      event_type:    `RESERVE_${alert_level}`,
      event_subtype: `RESERVE_RATIO_${status}`,
      currency,
      reserve_ratio,
      reason:        message,
      metadata:      { ratio: reserve_ratio, status },
    });

    // Notify admins
    await this._notifyAdmins({ title, message, level: alert_level, currency }).catch(err =>
      logger.error(`[TreasuryAlertService] Notification error: ${err.message}`)
    );

    // SystemState escalation
    if (alert_level === 'CRITICAL') {
      _consecutiveCritical[currency] = (_consecutiveCritical[currency] || 0) + 1;

      // Degrade withdrawals after first CRITICAL
      if (SystemState.getWithdrawalMode() === 'NORMAL') {
        SystemState.setWithdrawalMode('DEGRADED');
        logger.warn(`[TreasuryAlertService] Withdrawals set to DEGRADED due to ${currency} reserve deficit.`);
      }

      await this._checkFreezeThreshold(currency, reserve_ratio);
    } else {
      // Warn-level: reset consecutive counter
      _consecutiveCritical[currency] = 0;
    }
  }

  async _checkFreezeThreshold(currency, ratio) {
    const count = _consecutiveCritical[currency] || 0;
    if (count >= FREEZE_CONSECUTIVE_THRESHOLD) {
      logger.error(`[TreasuryAlertService] ${currency} has had ${count} consecutive CRITICAL reserve alerts. Freezing withdrawals.`);

      if (SystemState.getWithdrawalMode() !== 'FROZEN') {
        SystemState.setWithdrawalMode('FROZEN');
        await this._writeAuditLog({
          event_type:    'SAFE_MODE_TRIGGERED',
          event_subtype: 'RESERVE_DEFICIT_FREEZE',
          currency,
          reserve_ratio: ratio,
          reason:        `Withdrawal freeze triggered after ${count} consecutive CRITICAL reserve alerts for ${currency}.`,
          metadata:      { consecutive_count: count },
        });
      }
    }
  }

  _buildTitle(currency, status, ratio) {
    const ratioStr = typeof ratio === 'number' ? `${ratio.toFixed(2)}%` : 'unknown';
    const icons    = { WARNING: '⚠️', CRITICAL: '🚨', DEFICIT: '🔴' };
    const icon     = icons[status] || '🔔';
    return `${icon} Treasury Alert: ${currency} reserve at ${ratioStr} [${status}]`;
  }

  _buildMessage(report) {
    return [
      `Currency: ${report.currency}`,
      `Reserve Ratio: ${typeof report.reserve_ratio === 'number' ? report.reserve_ratio.toFixed(4) : '?'}%`,
      `External Assets: ${report.external_available?.toFixed(2)}`,
      `User Liability:  ${report.net_user_liability?.toFixed(2)}`,
      `Surplus/Deficit: ${report.reserve_surplus?.toFixed(2)}`,
      `Status: ${report.status}`,
    ].join('\n');
  }

  async _notifyAdmins({ title, message, level, currency, provider }) {
    try {
      const mailService = require('../mailService');
      const { data: admins } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'superadmin');

      if (!admins || admins.length === 0) return;

      for (const admin of admins) {
        await mailService.sendEmail({
          to:      admin.email,
          subject: `[NoteStandard Treasury] ${title}`,
          text:    message,
          html:    `<pre style="font-family:monospace">${message}</pre>`,
        }).catch(e => logger.warn(`[TreasuryAlertService] Email to ${admin.email} failed: ${e.message}`));
      }
    } catch (err) {
      logger.error(`[TreasuryAlertService] _notifyAdmins error: ${err.message}`);
    }
  }

  async _writeAuditLog(event) {
    try {
      const ImmutableAuditLog = require('./ImmutableAuditLog');
      await ImmutableAuditLog.record({
        event_type:    event.event_type,
        event_subtype: event.event_subtype,
        actor_type:    'SYSTEM',
        actor_id:      'TreasuryAlertService',
        currency:      event.currency,
        provider:      event.provider,
        reserve_ratio: event.reserve_ratio,
        reason:        event.reason,
        metadata:      event.metadata || {},
      });
    } catch (err) {
      logger.error(`[TreasuryAlertService] Audit log write failed: ${err.message}`);
    }
  }
}

module.exports = new TreasuryAlertService();
