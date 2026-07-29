'use strict';
/**
 * TreasuryDashboardService.js
 * ===========================
 * Assembles the complete treasury dashboard payload for the
 * admin UI in a single call.
 *
 * Aggregates data from all treasury sub-services into one
 * structured response. All reads are non-blocking and
 * individually fault-tolerant.
 *
 * @module services/treasury/TreasuryDashboardService
 */

const supabase            = require('../../config/database');
const logger              = require('../../utils/logger');
const TreasuryService     = require('./TreasuryService');
const ReserveCalculator   = require('./ReserveCalculator');
const LiquidityEngine     = require('./LiquidityEngine');
const TreasuryHealth      = require('./TreasuryHealth');
const FXTreasuryEngine    = require('./FXTreasuryEngine');
const ProviderHealthEngine = require('./ProviderHealthEngine');
const ImmutableAuditLog   = require('./ImmutableAuditLog');

const safe = (p) => p.catch(err => {
  logger.warn(`[TreasuryDashboard] Partial error: ${err.message}`);
  return null;
});

class TreasuryDashboardService {

  /**
   * Full dashboard payload — used by GET /api/admin/treasury/dashboard
   * @returns {Promise<object>}
   */
  async getFullDashboard() {
    const [
      overview,
      latestRatios,
      liquidityAll,
      healthReport,
      providerStatuses,
      fxExposure,
      fxDailyPnL,
      pendingSettlements,
      openRecommendations,
      recentAuditEvents,
      pendingTransfers,
    ] = await Promise.all([
      safe(TreasuryService.getTreasuryOverview()),
      safe(ReserveCalculator.getLatestRatios()),
      safe(LiquidityEngine.computeAll()),
      safe(TreasuryHealth.computeHealthReport()),
      safe(ProviderHealthEngine.getAllStatuses()),
      safe(FXTreasuryEngine.getExposureSummary()),
      safe(FXTreasuryEngine.getDailyPnL()),
      safe(this._getPendingSettlements()),
      safe(LiquidityEngine.getOpenRecommendations()),
      safe(ImmutableAuditLog.query({ limit: 20 })),
      safe(this._getPendingTransfers()),
    ]);

    return {
      success:   true,
      timestamp: new Date().toISOString(),

      // Top-level health
      health: healthReport || { grade: 'UNKNOWN', score: 0 },

      // Provider-side balances
      provider_balances: overview?.provider_balances || [],

      // Internal user liability aggregates
      internal_balances: overview?.internal_balances || {},

      // Reserve ratios per currency
      reserve_ratios: latestRatios || [],

      // Liquidity position per currency
      liquidity: liquidityAll ? Object.values(liquidityAll) : [],

      // Provider health and circuit breakers
      provider_health: providerStatuses || [],

      // FX exposure
      fx_exposure:   fxExposure || [],
      fx_daily_pnl:  fxDailyPnL || [],

      // Settlement pipeline
      pending_settlements: pendingSettlements || { count: 0, items: [] },

      // Operational metadata from overview
      pending_payouts: overview?.pending_payouts || 0,

      // Open liquidity recommendations
      recommendations: openRecommendations || [],

      // Treasury transfer approvals queue
      pending_transfers: pendingTransfers || [],

      // Recent audit events
      recent_audit: recentAuditEvents || [],
    };
  }

  /**
   * Lightweight summary for dashboard header — fast read.
   * @returns {Promise<object>}
   */
  async getQuickSummary() {
    const [health, ratios, providerStatuses] = await Promise.all([
      safe(TreasuryHealth.computeHealthReport()),
      safe(ReserveCalculator.getLatestRatios()),
      safe(ProviderHealthEngine.getAllStatuses()),
    ]);

    const providersDown = (providerStatuses || []).filter(p => p.status === 'DOWN' || p.circuit_breaker === 'OPEN').length;
    const criticalCurrencies = (ratios || []).filter(r => r.status === 'CRITICAL' || r.status === 'DEFICIT').map(r => r.currency);

    return {
      health_grade:         health?.grade || 'UNKNOWN',
      health_score:         health?.score || 0,
      providers_down:       providersDown,
      critical_currencies:  criticalCurrencies,
      timestamp:            new Date().toISOString(),
    };
  }

  /**
   * Historical reserve chart data for a currency.
   * @param {string} currency
   * @param {number} [hours=24]
   */
  async getReserveHistory(currency, hours = 24) {
    return ReserveCalculator.getReserveHistory(currency, hours);
  }

  /**
   * Snapshot history for a provider + currency pair.
   * @param {string} provider
   * @param {string} currency
   * @param {number} [limit=100]
   */
  async getSnapshotHistory(provider, currency, limit = 100) {
    return TreasuryService.getSnapshotHistory(provider, currency, limit);
  }

  /**
   * Audit log query proxy (for dashboard audit tab).
   * @param {object} filters
   */
  async getAuditEvents(filters = {}) {
    return ImmutableAuditLog.query(filters);
  }

  /**
   * Chain integrity verification result.
   * @param {number} [limit=200]
   */
  async verifyAuditChain(limit = 200) {
    return ImmutableAuditLog.verifyChain(limit);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  async _getPendingSettlements() {
    const { data, count, error } = await supabase
      .from('settlements')
      .select('id, reference, settlement_type, direction, currency, amount, current_stage, created_at', { count: 'exact' })
      .in('current_stage', ['INITIATED', 'PROVIDER_PENDING', 'PROVIDER_CONFIRMED', 'LEDGER_POSTED', 'TREASURY_VERIFIED'])
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw new Error(error.message);
    return { count: count || 0, items: data || [] };
  }

  async _getPendingTransfers() {
    const { data, error } = await supabase
      .from('treasury_transfers')
      .select('id, source_provider, target_provider, currency, amount, status, requested_reason, created_at')
      .in('status', ['PENDING_APPROVAL', 'APPROVED'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    return data || [];
  }
}

module.exports = new TreasuryDashboardService();
