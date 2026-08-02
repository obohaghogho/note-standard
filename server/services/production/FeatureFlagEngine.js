'use strict';

/**
 * FeatureFlagEngine.js
 * ====================
 * Runtime Feature Flag Engine for NoteStandard.
 * Evaluates feature flags dynamically without requiring deployments.
 */
class FeatureFlagEngine {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
    this.inMemoryFlags = new Map([
      ['BANKING_ENABLED', true],
      ['INSTANT_WITHDRAWALS', true],
      ['FX_ENGINE', true],
      ['ANCHOR_PROVIDER', true],
      ['CONDUIT_PROVIDER', true],
      ['AUTO_REBALANCING', true],
      ['TREASURY_AUTOMATION', true],
      ['SMART_ROUTING', true],
      ['WEBHOOK_PROCESSING', true],
      ['AUTO_FAILOVER', true]
    ]);
  }

  /**
   * Check if a feature is enabled
   */
  async isFeatureEnabled(featureKey, context = {}) {
    if (this.inMemoryFlags.has(featureKey)) {
      return this.inMemoryFlags.get(featureKey);
    }
    return true;
  }

  /**
   * Dynamically toggle feature flag
   */
  async setFeatureFlag(featureKey, enabled) {
    this.inMemoryFlags.set(featureKey, Boolean(enabled));
    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `INSERT INTO public.feature_flags (feature_key, enabled) VALUES ($1, $2)
           ON CONFLICT (feature_key) DO UPDATE SET enabled = $2, updated_at = NOW()`,
          [featureKey, Boolean(enabled)]
        );
      } catch (err) {
        // Fallback
      }
    }
    return { featureKey, enabled: Boolean(enabled) };
  }
}

module.exports = FeatureFlagEngine;
