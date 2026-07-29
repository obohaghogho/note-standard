'use strict';
/**
 * SettlementCalendar.js
 * =====================
 * T+0/T+1/T+2 settlement time awareness per provider + currency.
 * Provides expected settlement dates accounting for cutoff times,
 * weekends, and holidays.
 *
 * @module services/treasury/SettlementCalendar
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// Nigerian public holidays (updated annually)
const NG_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-03', // New Year's Day (observed)
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-05-01', // Workers Day
  '2026-06-12', // Democracy Day
  '2026-10-01', // Independence Day
  '2026-12-25', // Christmas Day
  '2026-12-26', // Boxing Day
];

const ALL_HOLIDAYS = new Set(NG_HOLIDAYS_2026);

const SettlementCalendar = {
  /**
   * Compute the expected settlement datetime for a transfer.
   *
   * @param {string} provider   - e.g. 'anchor', 'fincra'
   * @param {string} currency   - e.g. 'NGN', 'USD'
   * @param {Date}   [txnTime]  - Transaction time (default: now)
   * @returns {Promise<Date>} Expected settlement date
   */
  async getExpectedDate(provider, currency, txnTime = new Date()) {
    const key = String(provider).toLowerCase();
    const up  = String(currency).toUpperCase();

    // Load from DB
    const { data: cal } = await supabase
      .from('settlement_calendar')
      .select('*')
      .eq('provider', key)
      .or(`currency.eq.${up},currency.eq.ANY`)
      .order('currency', { ascending: false }) // specific first
      .limit(1)
      .maybeSingle();

    if (!cal) {
      // Default: T+1 business day
      return this._addBusinessDays(txnTime, 1, true);
    }

    let startDate = new Date(txnTime);

    // Apply cutoff time: if txn after cutoff, start from next business day
    if (cal.cutoff_time) {
      const [cutoffHour, cutoffMin] = cal.cutoff_time.split(':').map(Number);
      const txnHour = txnTime.getHours();
      const txnMin  = txnTime.getMinutes();

      if (txnHour > cutoffHour || (txnHour === cutoffHour && txnMin >= cutoffMin)) {
        startDate = this._addBusinessDays(txnTime, 1, cal.excludes_weekends);
        startDate.setHours(0, 0, 0, 0);
      }
    }

    // Add settlement days
    const settlementDate = this._addBusinessDays(
      startDate,
      cal.settlement_days,
      cal.excludes_weekends
    );

    return settlementDate;
  },

  /**
   * Summarise expected settlement info for display.
   */
  async getSummary(provider, currency) {
    const { data } = await supabase
      .from('settlement_calendar')
      .select('*')
      .eq('provider', String(provider).toLowerCase())
      .or(`currency.eq.${String(currency).toUpperCase()},currency.eq.ANY`)
      .limit(1)
      .maybeSingle();

    if (!data) return { model: 'T+1', typicalHours: 24 };

    return {
      model:        data.settlement_model,
      days:         data.settlement_days,
      cutoff:       data.cutoff_time,
      minHours:     data.min_hours,
      maxHours:     data.max_hours,
      typicalHours: data.typical_hours,
      excludesWeekends: data.excludes_weekends,
    };
  },

  /**
   * Get all settlement calendar entries (for admin dashboard).
   */
  async getAll() {
    const { data } = await supabase
      .from('settlement_calendar')
      .select('*')
      .order('provider');
    return data || [];
  },

  // ── Internal helpers ──────────────────────────────────────────────────────────

  _addBusinessDays(date, days, excludeWeekends = true) {
    const result = new Date(date);
    let added = 0;

    while (added < days) {
      result.setDate(result.getDate() + 1);
      if (excludeWeekends && (result.getDay() === 0 || result.getDay() === 6)) continue;
      if (ALL_HOLIDAYS.has(result.toISOString().split('T')[0])) continue;
      added++;
    }

    return result;
  },

  _isBusinessDay(date) {
    const day = date.getDay();
    if (day === 0 || day === 6) return false;
    if (ALL_HOLIDAYS.has(date.toISOString().split('T')[0])) return false;
    return true;
  },
};

module.exports = SettlementCalendar;
