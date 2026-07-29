'use strict';
/**
 * PaymentPolicyEngine.js
 * ======================
 * Evaluates configurable payment policies before routing.
 * Policies are loaded from the payment_policies table — no hardcoding.
 *
 * [Phase 17] Added versioning:
 *   - Each policy has a `version` integer; highest active version wins.
 *   - `valid_from` / `valid_to` support scheduled activation/expiry.
 *   - createVersionedPolicy() auto-increments version per policy_name.
 *   - getPolicyHistory() returns full audit trail per policy_name.
 *
 * Evaluation: all conditions AND'd. Most-restrictive action wins.
 * Decision shape: { allowed, requiresApproval, forcedProvider,
 *                   blockedProviders, flagForReview, matchedPolicies }
 *
 * @module services/orchestration/PaymentPolicyEngine
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

const PolicyEngine = {
  /**
   * Evaluate all active policies for a given payment context.
   *
   * @param {Object} ctx
   * @param {string}  ctx.operationType   - DEPOSIT | WITHDRAWAL | PAYOUT | SWAP | REFUND
   * @param {string}  ctx.currency
   * @param {string}  [ctx.method]
   * @param {number}  [ctx.amount]
   * @param {string}  [ctx.countryCode]
   * @param {string}  [ctx.userRiskTier]  - LOW | MEDIUM | HIGH
   * @param {string}  [ctx.userId]
   * @returns {Promise<PolicyDecision>}
   */
  async evaluate(ctx) {
    const {
      operationType, currency, method,
      amount = 0, countryCode, userRiskTier,
    } = ctx;

    const up  = String(currency).toUpperCase();
    const now = new Date().toISOString();

    // [Phase 17] Load active policies — versioned: highest version per policy_name wins
    const { data: rawPolicies } = await supabase
      .from('payment_policies')
      .select('*')
      .eq('is_active', true)
      .lte('valid_from', now)           // policy must be active by now
      .or(`valid_to.is.null,valid_to.gt.${now}`)  // not yet expired
      .order('priority', { ascending: true })
      .order('version',  { ascending: false });   // highest version first

    // Dedupe: keep only highest version per policy_name
    const seen = new Set();
    const policies = (rawPolicies || []).filter(p => {
      const key = p.policy_name || p.policy_type || String(p.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const matchedPolicies = policies.filter(p =>
      this._matches(p, { operationType, currency: up, method, amount, countryCode, userRiskTier })
    );

    if (matchedPolicies.length === 0) {
      return this._buildDecision([], ctx);
    }

    logger.info(`[PolicyEngine] ${matchedPolicies.length} policies matched for ${operationType} ${amount} ${up}`);
    return this._buildDecision(matchedPolicies, ctx);
  },

  /**
   * Check if a single policy matches the context (all conditions AND'd).
   */
  _matches(policy, { operationType, currency, method, amount, countryCode, userRiskTier }) {
    if (policy.cond_currency        && policy.cond_currency.toUpperCase()        !== currency)                  return false;
    if (policy.cond_operation_type  && policy.cond_operation_type.toUpperCase()  !== operationType.toUpperCase()) return false;
    if (policy.cond_method          && policy.cond_method                        !== method)                    return false;
    if (policy.cond_min_amount      && amount < parseFloat(policy.cond_min_amount))                             return false;
    if (policy.cond_max_amount      && amount > parseFloat(policy.cond_max_amount))                             return false;
    if (policy.cond_country_code    && policy.cond_country_code.toUpperCase()    !== (countryCode || '').toUpperCase()) return false;
    if (policy.cond_user_risk_tier  && policy.cond_user_risk_tier.toUpperCase()  !== (userRiskTier || '').toUpperCase()) return false;

    // Time window check
    if (policy.cond_time_from || policy.cond_time_until) {
      const now      = new Date();
      const hhmm     = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      if (policy.cond_time_from && hhmm < policy.cond_time_from)   return false;
      if (policy.cond_time_until && hhmm >= policy.cond_time_until) return false;
    }

    return true;
  },

  /**
   * Merge all matched policy actions into a single PolicyDecision.
   * Later policies (higher priority number) can override earlier ones.
   */
  _buildDecision(policies, ctx) {
    const decision = {
      allowed:            true,
      requiresApproval:   false,
      requires2FA:        false,
      forcedProvider:     null,
      blockedProviders:   [],
      flagForReview:      false,
      notifyAdmin:        false,
      addDelayMs:         0,
      maxDailyVolume:     null,
      matchedPolicies:    policies.map(p => ({ id: p.id, name: p.policy_name, priority: p.priority, version: p.version || 1 })),
    };

    for (const p of policies) {
      if (p.action_require_approval)  decision.requiresApproval = true;
      if (p.action_require_2fa)       decision.requires2FA      = true;
      if (p.action_force_provider)    decision.forcedProvider   = p.action_force_provider;
      if (p.action_flag_for_review)   decision.flagForReview    = true;
      if (p.action_notify_admin)      decision.notifyAdmin      = true;
      if (p.action_add_delay_ms)      decision.addDelayMs       = Math.max(decision.addDelayMs, p.action_add_delay_ms);
      if (p.action_max_daily_volume)  decision.maxDailyVolume   = p.action_max_daily_volume;
      if (p.action_block_providers?.length) {
        decision.blockedProviders.push(...p.action_block_providers);
      }
    }

    decision.blockedProviders = [...new Set(decision.blockedProviders)];

    if (decision.requiresApproval) {
      logger.info(`[PolicyEngine] Approval required — policies: ${decision.matchedPolicies.map(p => p.name).join(', ')}`);
    }

    return decision;
  },

  // ─── [Phase 17] Versioned Policy Management ──────────────────────────────────

  /**
   * Create a new versioned policy.
   * Auto-increments `version` from the latest existing record with the same policy_name.
   *
   * @param {Object} policyData - Must include policy_name, is_active, priority, and any cond_* / action_* fields
   * @param {string} [createdBy]
   */
  async createVersionedPolicy(policyData, createdBy = 'SYSTEM') {
    const name = policyData.policy_name;
    if (!name) throw new Error('[PolicyEngine] policy_name is required');

    // Find current max version
    const { data: existing } = await supabase
      .from('payment_policies')
      .select('version')
      .eq('policy_name', name)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = ((existing?.[0]?.version) || 0) + 1;

    const { data, error } = await supabase
      .from('payment_policies')
      .insert({
        ...policyData,
        version:    nextVersion,
        created_by: createdBy,
        created_at: new Date().toISOString(),
        valid_from: policyData.valid_from || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`[PolicyEngine] Failed to create policy: ${error.message}`);
    logger.info(`[PolicyEngine] Created '${name}' v${nextVersion}`);
    return data;
  },

  /**
   * Returns all versions of a policy by name, newest first.
   */
  async getPolicyHistory(policyName) {
    const { data, error } = await supabase
      .from('payment_policies')
      .select('*')
      .eq('policy_name', policyName)
      .order('version', { ascending: false });

    if (error) throw new Error(`[PolicyEngine] History query failed: ${error.message}`);
    return data || [];
  },

  /**
   * Retire (deactivate) a policy version.
   */
  async retirePolicy(policyId, retiredBy = 'SYSTEM') {
    const { error } = await supabase
      .from('payment_policies')
      .update({ is_active: false, valid_to: new Date().toISOString() })
      .eq('id', policyId);
    if (error) throw new Error(`[PolicyEngine] Retire failed: ${error.message}`);
    logger.info(`[PolicyEngine] Retired policy ${policyId} by ${retiredBy}`);
  },
};

module.exports = PolicyEngine;
