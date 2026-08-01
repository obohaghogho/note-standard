'use strict';

const supabase = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * SettlementPolicyService
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider-driven settlement policies & per-currency withdrawal timeouts.
 * Serves as the central authority for settlement window calculations and rules.
 */
class SettlementPolicyService {
  /**
   * Default fallback policy when no DB row exists
   */
  static DEFAULT_POLICY = {
    settlement_window_minutes: 1440, // T+1
    withdrawal_timeout_minutes: 4320, // 72 hours
    deposit_settles_instantly: false,
  };

  /**
   * Get policy for a given provider and currency.
   * Caches/reads from settlement_policies table or falls back to defaults.
   *
   * @param {string} provider  e.g. 'fincra', 'anchor'
   * @param {string} currency  e.g. 'NGN', 'USD'
   * @returns {Promise<{
   *   settlement_window_minutes: number,
   *   withdrawal_timeout_minutes: number,
   *   deposit_settles_instantly: boolean,
   *   description?: string
   * }>}
   */
  async getPolicy(provider, currency) {
    const prov = (provider || 'fincra').toLowerCase();
    const curr = (currency || 'NGN').toUpperCase();

    try {
      const { data, error } = await supabase
        .from('settlement_policies')
        .select('*')
        .eq('provider', prov)
        .eq('currency', curr)
        .maybeSingle();

      if (error) {
        logger.warn(`[SettlementPolicyService] DB fetch failed for ${prov}/${curr}: ${error.message}`);
      }

      if (data) {
        return data;
      }
    } catch (err) {
      logger.error(`[SettlementPolicyService] Error fetching policy: ${err.message}`);
    }

    // Hardcoded safety fallbacks if DB table is unpopulated
    if (prov === 'fincra' && ['NGN', 'USDT', 'USDC', 'CNGN'].includes(curr)) {
      return {
        settlement_window_minutes: 0,
        withdrawal_timeout_minutes: 1440, // 24 hours for NGN / stablecoins
        deposit_settles_instantly: true,
      };
    }

    return SettlementPolicyService.DEFAULT_POLICY;
  }

  /**
   * Calculates the expected settlement timestamp for a new deposit.
   *
   * @param {string} provider
   * @param {string} currency
   * @param {Date} [fromDate=new Date()]
   * @returns {Promise<Date>}
   */
  async calculateExpectedSettlementAt(provider, currency, fromDate = new Date()) {
    const policy = await this.getPolicy(provider, currency);
    const ms = policy.settlement_window_minutes * 60 * 1000;
    return new Date(fromDate.getTime() + ms);
  }

  /**
   * Calculates the withdrawal reservation timeout timestamp.
   *
   * @param {string} provider
   * @param {string} currency
   * @param {Date} [fromDate=new Date()]
   * @returns {Promise<Date>}
   */
  async calculateWithdrawalTimeoutAt(provider, currency, fromDate = new Date()) {
    const policy = await this.getPolicy(provider, currency);
    const ms = policy.withdrawal_timeout_minutes * 60 * 1000;
    return new Date(fromDate.getTime() + ms);
  }
}

module.exports = new SettlementPolicyService();
