const supabase = require("../config/database");
const logger = require("../utils/logger");

/**
 * SubscriptionExpirationWorker
 * ────────────────────────────
 * Authoritative background worker that sweeps for active subscriptions past their end_date,
 * downgrades subscriptions and profiles to 'free', pauses active ad campaigns, and invalidates entitlement caches.
 */
class SubscriptionExpirationWorker {
  async processExpiredSubscriptions() {
    try {
      const nowIso = new Date().toISOString();

      // Find all active subscriptions where end_date < NOW
      const { data: expiredSubs, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, plan_tier, end_date")
        .eq("status", "active")
        .not("end_date", "is", null)
        .lt("end_date", nowIso);

      if (error) throw error;
      if (!expiredSubs || expiredSubs.length === 0) {
        return { success: true, processedCount: 0 };
      }

      logger.info(`[SubscriptionExpirationWorker] Found ${expiredSubs.length} expired subscriptions to downgrade.`);

      const userIds = expiredSubs.map(s => s.user_id).filter(Boolean);
      const subIds = expiredSubs.map(s => s.id);

      // 1. Bulk update subscriptions status to 'expired' and tier to 'free'
      await supabase
        .from("subscriptions")
        .update({ status: "expired", plan_tier: "free", plan_type: "FREE" })
        .in("id", subIds);

      // 2. Bulk update profiles plan_tier to 'free'
      if (userIds.length > 0) {
        await supabase
          .from("profiles")
          .update({ plan_tier: "free" })
          .in("id", userIds);

        // 3. Pause active ads for downgraded users
        await supabase
          .from("ads")
          .update({ status: "paused" })
          .in("user_id", userIds)
          .eq("status", "approved");

        // 4. Invalidate entitlement cache for each user
        const planService = require("../services/planService");
        userIds.forEach(uid => planService.invalidateEntitlementCache(uid));
      }

      logger.info(`[SubscriptionExpirationWorker] Successfully downgraded ${userIds.length} users to free plan tier.`);
      return { success: true, processedCount: userIds.length };
    } catch (err) {
      logger.error(`[SubscriptionExpirationWorker] Error sweeping expired subscriptions: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new SubscriptionExpirationWorker();
