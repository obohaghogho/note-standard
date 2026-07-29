'use strict';
/**
 * RoutingEngine.js
 * ================
 * AI-driven, multi-factor provider routing engine.
 * Wraps GatewayRouter with DB-backed policies, live health scores,
 * cost optimization, and liquidity awareness.
 *
 * Routing score per provider:
 *   (HealthScore    × health_weight)    +
 *   (CostScore      × cost_weight)      +
 *   (LatencyScore   × latency_weight)   +
 *   (LiquidityScore × liquidity_weight)
 *
 * Liquidity guard: provider excluded if available_balance < requested_amount.
 * Circuit guard:   provider excluded if composite_score === 0 (circuit OPEN).
 *
 * Every decision is recorded to routing_decisions for analytics.
 *
 * @module services/payment/RoutingEngine
 */

const supabase          = require('../../config/database');
const logger            = require('../../utils/logger');
const GatewayRouter     = require('./GatewayRouter');
const { PAYMENT_PROVIDER_CAPABILITIES, isInMaintenance, getMaintenanceMode } = require('../../config/providerCapabilities');

// Lazy-load to avoid circular deps
const _scorer  = () => require('./ProviderHealthScorer');

const DEFAULT_WEIGHTS = {
  health_weight:    0.30,
  cost_weight:      0.25,
  latency_weight:   0.20,
  liquidity_weight: 0.25,
};

const RoutingEngine = {
  /**
   * Select the best provider for a given operation context.
   *
   * @param {Object} params
   * @param {string}  params.currency
   * @param {string}  params.method           - bank_transfer | dva | card | crypto | payout
   * @param {string}  params.transactionType  - DEPOSIT | WITHDRAWAL | PAYOUT | SWAP
   * @param {number}  [params.amount]         - Used for liquidity guard
   * @param {string}  [params.correlationId]
   * @param {string}  [params.region]
   * @param {string[]} [params.excludeProviders]
   * @returns {Promise<{ provider: string, score: number, scoreBreakdown: Object, isNative: boolean, adapter: Object }>}
   */
  async selectBestProvider(params) {
    const {
      currency, method, transactionType = 'ANY',
      amount = 0, correlationId, region,
      excludeProviders = [],
    } = params;

    const up = String(currency).toUpperCase();

    // ── 1. Load routing policy ───────────────────────────────────────────────
    const policy = await this._getPolicy(up, method, transactionType);
    const weights = {
      health_weight:    policy?.health_weight    ?? DEFAULT_WEIGHTS.health_weight,
      cost_weight:      policy?.cost_weight      ?? DEFAULT_WEIGHTS.cost_weight,
      latency_weight:   policy?.latency_weight   ?? DEFAULT_WEIGHTS.latency_weight,
      liquidity_weight: policy?.liquidity_weight ?? DEFAULT_WEIGHTS.liquidity_weight,
    };
    const excluded = [...(policy?.excluded_providers || []), ...excludeProviders];

    // Hard provider preference (overrides scoring)
    if (policy?.preferred_provider && !excluded.includes(policy.preferred_provider)) {
      logger.info(`[RoutingEngine] Policy hard-routes to: ${policy.preferred_provider}`);
      return this._resolveProvider(policy.preferred_provider, correlationId, params, weights, 100, true);
    }

    // ── 2. Crypto shortcut ───────────────────────────────────────────────────
    if (method === 'crypto') {
      return this._resolveProvider('nowpayments', correlationId, params, weights, 70, true);
    }

    // ── 3. Load health scores + liquidity data in parallel ──────────────────
    const [healthScores, providerBalances] = await Promise.all([
      this._getHealthScores(),
      amount > 0 ? this._getProviderBalances(up) : Promise.resolve({}),
    ]);

    // ── 4. Load cost matrix ───────────────────────────────────────────────────
    const costScores = await this._getCostScores(up, transactionType);

    // ── 5. Score all eligible providers ──────────────────────────────────────
    const candidates = [];

    for (const [name, caps] of Object.entries(PAYMENT_PROVIDER_CAPABILITIES)) {
      if (!caps.merchantEnabled) continue;
      if (excluded.includes(name)) continue;
      if (!caps.methods.includes(method) && method !== 'ANY') continue;

      const nativeSupport = caps.nativeCurrencies?.includes(up);
      const fallbackSupport = caps.fallbackCurrencies?.includes(up);
      if (!nativeSupport && !fallbackSupport) continue;

      // [Phase 17] Maintenance mode guard
      if (isInMaintenance(name)) {
        logger.info(`[RoutingEngine] Excluding ${name} — maintenanceMode=${getMaintenanceMode(name)}`);
        continue;
      }

      // Health score (0–100) from ProviderHealthScorer
      const healthData    = healthScores[name] || { composite_score: 75, circuit_state: 'CLOSED' };
      const healthScore   = healthData.composite_score;

      // Circuit OPEN → exclude immediately
      if (healthData.circuit_state === 'OPEN' || healthScore === 0) {
        logger.info(`[RoutingEngine] Excluding ${name} — circuit OPEN or score=0`);
        continue;
      }

      // Liquidity guard — skip if provider cannot cover the amount
      const providerBalance = providerBalances[name] || Infinity;
      if (amount > 0 && providerBalance < amount) {
        logger.info(`[RoutingEngine] Excluding ${name} — insufficient liquidity (${providerBalance} < ${amount} ${up})`);
        continue;
      }

      // Cost score (0–30)
      const costScore = costScores[name] ?? 15;

      // Latency score from health scorer (0–100 → normalised)
      const latencyScore = healthData.latency_score ?? 75;

      // Liquidity score (how much headroom above the requested amount)
      const liquidityScore = amount > 0 && providerBalance < Infinity
        ? Math.min(100, Math.round((providerBalance / Math.max(amount, 1)) * 20))
        : 80;

      // Native currency bonus
      const nativeBonus = nativeSupport ? 10 : 0;

      const totalScore = Math.round(
        (healthScore   * weights.health_weight)    +
        (costScore     * weights.cost_weight * 3)  +  // normalise cost (0-30 → 0-90)
        (latencyScore  * weights.latency_weight)   +
        (liquidityScore * weights.liquidity_weight) +
        nativeBonus
      );

      candidates.push({
        name,
        totalScore,
        breakdown: {
          health_score:    healthScore,
          cost_score:      costScore,
          latency_score:   latencyScore,
          liquidity_score: liquidityScore,
          native_bonus:    nativeBonus,
        },
        isNative: nativeSupport,
      });
    }

    if (candidates.length === 0) {
      logger.error(`[RoutingEngine] No eligible providers for ${up}/${method}/${transactionType}`);
      throw new Error(`No eligible provider available for ${up} ${method} ${transactionType}`);
    }

    candidates.sort((a, b) => b.totalScore - a.totalScore);
    const best = candidates[0];

    logger.info(`[RoutingEngine] Selected: ${best.name} score=${best.totalScore} | ${up}/${method}/${transactionType}`);
    return this._resolveProvider(best.name, correlationId, params, weights, best.totalScore, best.isNative, best.breakdown, candidates);
  },

  /**
   * Returns an ordered list of providers for failover (best → worst).
   */
  async getFailoverChain(params) {
    const { currency, method, transactionType = 'ANY' } = params;
    const up = String(currency).toUpperCase();

    // Check DB failover config first
    const { data: config } = await supabase
      .from('failover_config')
      .select('provider_chain')
      .or(`currency.eq.${up},currency.eq.ANY`)
      .or(`method.eq.${method},method.eq.ANY`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (config?.provider_chain?.length > 0) {
      return config.provider_chain;
    }

    // Fallback: return all compatible providers sorted by current score
    const healthScores = await this._getHealthScores();
    const chain = Object.entries(PAYMENT_PROVIDER_CAPABILITIES)
      .filter(([, caps]) => caps.merchantEnabled && caps.methods.includes(method))
      .filter(([, caps]) => caps.nativeCurrencies?.includes(up) || caps.fallbackCurrencies?.includes(up))
      .map(([name]) => ({ name, score: healthScores[name]?.composite_score ?? 75 }))
      .sort((a, b) => b.score - a.score)
      .map(p => p.name);

    return chain;
  },

  /**
   * Record a routing decision to the routing_decisions table.
   */
  async _recordDecision(correlationId, params, selected, breakdown, candidates = [], hop = 0, failoverFrom = null) {
    await supabase
      .from('routing_decisions')
      .insert({
        correlation_id:   correlationId || null,
        transaction_type: params.transactionType || 'ANY',
        currency:         params.currency,
        amount:           params.amount || null,
        method:           params.method || null,
        selected_provider: selected,
        fallback_providers: (candidates || []).slice(1).map(c => c.name),
        score_breakdown:   breakdown || {},
        failover_hop:      hop,
        failover_from:     failoverFrom || null,
        outcome:           'PENDING',
      })
      .catch(e => logger.warn(`[RoutingEngine] Failed to record decision: ${e.message}`));
  },

  // ── Internals ─────────────────────────────────────────────────────────────────

  async _getPolicy(currency, method, transactionType) {
    const { data } = await supabase
      .from('routing_policies')
      .select('*')
      .eq('is_active', true)
      .or(`currency.eq.${currency},currency.eq.ANY`)
      .or(`method.eq.${method},method.eq.ANY`)
      .or(`transaction_type.eq.${transactionType},transaction_type.eq.ANY`)
      .order('currency', { ascending: false }) // specific currency first
      .limit(1)
      .maybeSingle();
    return data || null;
  },

  async _getHealthScores() {
    const { data } = await supabase
      .from('provider_health_scores')
      .select('provider, composite_score, latency_score, circuit_state, routing_weight');
    const map = {};
    for (const row of (data || [])) map[row.provider] = row;
    return map;
  },

  async _getProviderBalances(currency) {
    const { data } = await supabase
      .from('treasury_provider_balances')
      .select('provider, available_balance')
      .eq('currency', currency)
      .eq('sync_status', 'SUCCESS');
    const map = {};
    for (const row of (data || [])) map[row.provider] = parseFloat(row.available_balance || 0);
    return map;
  },

  async _getCostScores(currency, operationType) {
    const { data } = await supabase
      .from('provider_cost_scores')
      .select('provider, cost_score')
      .or(`currency.eq.${currency},currency.eq.ANY`)
      .or(`operation_type.eq.${operationType},operation_type.eq.ANY`);
    const map = {};
    for (const row of (data || [])) {
      if (!map[row.provider]) map[row.provider] = row.cost_score;
    }
    return map;
  },

  async _resolveProvider(name, correlationId, params, weights, score, isNative, breakdown = {}, candidates = []) {
    const adapterMap = {
      fincra:      () => require('./adapters/FincraAdapter'),
      anchor:      () => require('./adapters/AnchorAdapter'),
      paystack:    () => require('./adapters/PaystackAdapter'),
      grey:        () => require('./adapters/GreyAdapter'),
      nowpayments: () => require('./adapters/NowPaymentsAdapter'),
    };

    const loader = adapterMap[name];
    if (!loader) throw new Error(`[RoutingEngine] Unknown provider: ${name}`);

    const adapter = loader();
    await this._recordDecision(correlationId, params, name, { ...breakdown, total_score: score }, candidates);
    return { provider: name, score, scoreBreakdown: breakdown, isNative, adapter };
  },
};

module.exports = RoutingEngine;
