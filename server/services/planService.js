const supabase = require("../config/database");
const cache = require("../utils/cache");
const logger = require("../utils/logger");

/**
 * Versioned Plan Configurations (V1)
 * Uses null and boolean flags instead of Infinity for clean JSON serialization.
 */
const PLAN_CONFIG_V1 = {
  FREE: {
    planVersion: "v1",
    tier: "free",
    maxNotes: 100,
    unlimitedNotes: false,
    storageLimitBytes: 10485760, // 10 MB
    canUseTeams: false,
    spreadPercent: 1.0,
    systemFeeDiscount: 0.0,
    supportPriorityFloor: "low"
  },
  PRO: {
    planVersion: "v1",
    tier: "pro",
    maxNotes: null,
    unlimitedNotes: true,
    storageLimitBytes: 1073741824, // 1 GB
    canUseTeams: false,
    spreadPercent: 0.5,
    systemFeeDiscount: 0.20,
    supportPriorityFloor: "normal"
  },
  BUSINESS: {
    planVersion: "v1",
    tier: "business",
    maxNotes: null,
    unlimitedNotes: true,
    storageLimitBytes: 5368709120, // 5 GB
    canUseTeams: true,
    spreadPercent: 0.5,
    systemFeeDiscount: 0.50,
    supportPriorityFloor: "high"
  }
};

class PlanService {
  constructor() {
    this.ENTITLEMENT_TTL = 120; // 2 minutes entitlement cache TTL
  }

  /**
   * Get the versioned plan configuration object for a tier name
   */
  getPlanConfig(tier = "free") {
    const normTier = (tier || "free").toUpperCase();
    return PLAN_CONFIG_V1[normTier] || PLAN_CONFIG_V1.FREE;
  }

  /**
   * Single Source of Truth for resolving a user's active entitlement.
   * Evaluates subscriptions table: if active and end_date > NOW -> active tier, else 'free'.
   * Cached in memory for 120 seconds.
   */
  async getEffectivePlan(userId) {
    if (!userId) return this.getPlanConfig("free");

    const cacheKey = `entitlement_user_${userId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Query active subscription from database
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_tier, status, end_date, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      let effectiveTier = "free";
      let expiresAt = null;

      if (sub && sub.status === "active") {
        if (!sub.end_date || new Date(sub.end_date) > new Date()) {
          effectiveTier = (sub.plan_tier || "free").toLowerCase();
          expiresAt = sub.end_date || null;
        } else {
          logger.info(`[PlanService] Subscription for user ${userId} expired on ${sub.end_date}. Defaulting to free tier and syncing database state.`);
          this.syncExpiredSubscription(userId).catch(err => {
            logger.warn(`[PlanService] Non-critical background sub expiration sync error for ${userId}: ${err.message}`);
          });
        }
      }

      const config = this.getPlanConfig(effectiveTier);
      const result = {
        ...config,
        expiresAt,
        status: sub?.status || "inactive"
      };

      cache.set(cacheKey, result, this.ENTITLEMENT_TTL);
      return result;
    } catch (err) {
      logger.error(`[PlanService] Failed to resolve effective plan for user ${userId}: ${err.message}`);
      return this.getPlanConfig("free");
    }
  }

  /**
   * Authoritatively sync expired subscription and profile states in database to 'free'
   */
  async syncExpiredSubscription(userId) {
    if (!userId) return;

    try {
      await supabase
        .from("subscriptions")
        .update({ status: "expired", plan_tier: "free", plan_type: "FREE" })
        .eq("user_id", userId)
        .eq("status", "active");

      await supabase
        .from("profiles")
        .update({ plan_tier: "free" })
        .eq("id", userId);

      await supabase
        .from("ads")
        .update({ status: "paused" })
        .eq("user_id", userId)
        .eq("status", "approved");

      this.invalidateEntitlementCache(userId);
    } catch (err) {
      logger.error(`[PlanService] Error in syncExpiredSubscription for ${userId}: ${err.message}`);
    }
  }

  /**
   * Resolve entitlement for a team workspace based on the workspace owner's effective subscription
   */
  async getEffectiveWorkspacePlan(workspaceOwnerId) {
    if (!workspaceOwnerId) return this.getPlanConfig("free");

    const cacheKey = `entitlement_workspace_${workspaceOwnerId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const plan = await this.getEffectivePlan(workspaceOwnerId);
    cache.set(cacheKey, plan, this.ENTITLEMENT_TTL);
    return plan;
  }

  /**
   * Instantly invalidate user and workspace entitlement caches when subscription state changes
   */
  invalidateEntitlementCache(userId) {
    if (!userId) return;
    cache.del(`entitlement_user_${userId}`);
    cache.del(`entitlement_workspace_${userId}`);
    logger.info(`[PlanService] Invalidated entitlement cache for user ${userId}`);
  }
}

module.exports = new PlanService();
