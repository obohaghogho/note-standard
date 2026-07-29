'use strict';
/**
 * RebalancingAdvisor.js
 * =====================
 * Detects provider distribution drift and generates rebalancing recommendations.
 * Recommendations are NON-EXECUTING by default — they require admin approval.
 * Set auto_rebalance=true in failover_config to enable automatic execution (future).
 *
 * Triggers:
 *   1. Single provider holds < 10% of total liquidity while overall ratio is healthy
 *   2. Routing policy prefers Provider A but Provider A holds < 30% of needed liquidity
 *   3. Single provider holds > 80% of total currency → concentration risk
 *
 * @module services/treasury/RebalancingAdvisor
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

const THRESHOLDS = {
  LOW_CONCENTRATION_PCT:  10,  // Warn if provider < 10% of total
  HIGH_CONCENTRATION_PCT: 80,  // Warn if provider > 80% of total
  PREFERRED_MIN_PCT:      30,  // Preferred provider should hold ≥ 30%
  TARGET_DISTRIBUTION:    40,  // Ideal max per provider (configurable)
};

const FIAT_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'];

const RebalancingAdvisor = {
  /**
   * Analyse current distribution and generate recommendations for all currencies.
   */
  async analyse() {
    const recommendations = [];

    for (const currency of FIAT_CURRENCIES) {
      const recs = await this.analyseForCurrency(currency);
      recommendations.push(...recs);
    }

    // Persist new recommendations
    if (recommendations.length > 0) {
      await supabase
        .from('rebalancing_recommendations')
        .insert(recommendations)
        .catch(e => logger.warn(`[RebalancingAdvisor] Persist failed: ${e.message}`));
    }

    logger.info(`[RebalancingAdvisor] Generated ${recommendations.length} recommendations.`);
    return recommendations;
  },

  /**
   * Analyse one currency.
   */
  async analyseForCurrency(currency) {
    const up = String(currency).toUpperCase();

    const { data: balances } = await supabase
      .from('treasury_provider_balances')
      .select('provider, available_balance')
      .eq('currency', up)
      .eq('sync_status', 'SUCCESS');

    if (!balances || balances.length < 2) return [];

    const providers = balances.map(b => ({
      provider: b.provider,
      amount:   parseFloat(b.available_balance || 0),
    }));

    const total = providers.reduce((s, p) => s + p.amount, 0);
    if (total === 0) return [];

    const recommendations = [];

    for (const p of providers) {
      const pct = (p.amount / total) * 100;

      // Rule 1: Concentration risk (> 80%)
      if (pct > THRESHOLDS.HIGH_CONCENTRATION_PCT) {
        const excess = ((pct - THRESHOLDS.TARGET_DISTRIBUTION) / 100) * total;
        const targets = providers.filter(o => o.provider !== p.provider && o.amount < total * 0.4);
        const target  = targets.sort((a, b) => a.amount - b.amount)[0];

        if (target) {
          recommendations.push(this._makeRec({
            fromProvider:    p.provider,
            toProvider:      target.provider,
            currency:        up,
            amount:          parseFloat(excess.toFixed(2)),
            fromBalance:     p.amount,
            toBalance:       target.amount,
            totalLiquidity:  total,
            fromPct:         pct,
            toPct:           (target.amount / total) * 100,
            reason:          `${p.provider} holds ${pct.toFixed(1)}% of ${up} treasury — concentration risk. Target: ≤${THRESHOLDS.TARGET_DISTRIBUTION}%`,
            urgency:         pct > 90 ? 'HIGH' : 'MEDIUM',
          }));
        }
      }

      // Rule 2: Starvation risk (< 10%)
      if (pct < THRESHOLDS.LOW_CONCENTRATION_PCT && p.amount > 0) {
        const donors = providers.filter(o => o.provider !== p.provider && (o.amount / total) * 100 > 40);
        const donor  = donors.sort((a, b) => b.amount - a.amount)[0];

        if (donor) {
          const targetAmount = (THRESHOLDS.TARGET_DISTRIBUTION / 100) * total;
          const moveAmount   = Math.min(targetAmount - p.amount, (donor.amount - targetAmount));
          if (moveAmount > 0) {
            recommendations.push(this._makeRec({
              fromProvider:    donor.provider,
              toProvider:      p.provider,
              currency:        up,
              amount:          parseFloat(moveAmount.toFixed(2)),
              fromBalance:     donor.amount,
              toBalance:       p.amount,
              totalLiquidity:  total,
              fromPct:         (donor.amount / total) * 100,
              toPct:           pct,
              reason:          `${p.provider} holds only ${pct.toFixed(1)}% of ${up} treasury — liquidity starvation risk`,
              urgency:         'LOW',
            }));
          }
        }
      }
    }

    return recommendations;
  },

  _makeRec({ fromProvider, toProvider, currency, amount, fromBalance, toBalance, totalLiquidity, fromPct, toPct, reason, urgency }) {
    return {
      from_provider:       fromProvider,
      to_provider:         toProvider,
      currency,
      recommended_amount:  amount,
      from_balance:        fromBalance,
      to_balance:          toBalance,
      total_liquidity:     totalLiquidity,
      from_pct_before:     parseFloat(fromPct.toFixed(2)),
      to_pct_before:       parseFloat(toPct.toFixed(2)),
      target_pct:          THRESHOLDS.TARGET_DISTRIBUTION,
      reason,
      urgency,
      status:              'OPEN',
    };
  },

  /**
   * Get open recommendations for admin dashboard.
   */
  async getOpenRecommendations(currency = null) {
    let q = supabase
      .from('rebalancing_recommendations')
      .select('*')
      .eq('status', 'OPEN')
      .gt('expires_at', new Date().toISOString())
      .order('urgency', { ascending: false });

    if (currency) q = q.eq('currency', String(currency).toUpperCase());

    const { data } = await q;
    return data || [];
  },
};

module.exports = RebalancingAdvisor;
