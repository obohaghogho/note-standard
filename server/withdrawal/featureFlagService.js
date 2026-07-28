/**
 * First-Class Feature Flag Manager
 * ─────────────────────────────────
 * Controls operational feature rollouts dynamically from withdrawal_system_config table.
 */

const supabase = require("../config/database");
const logger   = require("../utils/logger");

class FeatureFlagService {
  constructor() {
    this.flagsCache = {
      ENABLE_FINCRA_V2:              true,
      ENABLE_PROVIDER_FAILOVER:      true,
      ENABLE_MANUAL_REVIEW:          true,
      ENABLE_RISK_ENGINE:            true,
      ENABLE_RECEIPTS:               true,
      ENABLE_PROVIDER_HEALTH_MONITOR: true,
    };
  }

  /**
   * Check if a feature flag is enabled.
   * @param {string} flagName 
   * @returns {boolean}
   */
  isEnabled(flagName) {
    return this.flagsCache[flagName] ?? true;
  }

  /**
   * Refresh feature flags from database config.
   */
  async refreshFlags() {
    try {
      const { data } = await supabase
        .from("withdrawal_system_config")
        .select("value")
        .eq("key", "feature_flags")
        .maybeSingle();

      if (data && data.value) {
        this.flagsCache = { ...this.flagsCache, ...data.value };
        logger.info("[FeatureFlagService] Refreshed feature flags", this.flagsCache);
      }
    } catch (err) {
      logger.warn(`[FeatureFlagService] Refresh warning: ${err.message}`);
    }
  }
}

const featureFlags = new FeatureFlagService();

module.exports = featureFlags;
