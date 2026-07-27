const planService = require("../services/planService");

/**
 * Middleware: requirePlanFeature
 * Verifies that the authenticated user's effective plan includes a required feature flag.
 */
function requirePlanFeature(featureKey) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const plan = await planService.getEffectivePlan(req.user.id);

      if (!plan[featureKey]) {
        return res.status(403).json({
          error: `Feature '${featureKey}' is not available on your current subscription plan (${plan.tier.toUpperCase()}).`,
          code: "FEATURE_NOT_ALLOWED",
          reason: "PLAN_RESTRICTION",
          currentTier: plan.tier,
          upgradeRequired: true
        });
      }

      req.userPlan = plan;
      next();
    } catch (err) {
      console.error("[SubscriptionMiddleware] Feature check error:", err);
      res.status(500).json({ error: "Failed to verify subscription entitlements" });
    }
  };
}

/**
 * Helper function to assert structured quota responses
 */
function formatQuotaError({ code, reason, message, limit, current, usedBytes, limitBytes, upgradeRequired = true }) {
  const payload = {
    error: message,
    code,
    reason,
    upgradeRequired
  };
  if (limit !== undefined) payload.limit = limit;
  if (current !== undefined) payload.current = current;
  if (usedBytes !== undefined) payload.usedBytes = usedBytes;
  if (limitBytes !== undefined) payload.limitBytes = limitBytes;
  if (usedBytes !== undefined && limitBytes !== undefined) {
    payload.remainingBytes = Math.max(0, limitBytes - usedBytes);
  }
  return payload;
}

module.exports = {
  requirePlanFeature,
  formatQuotaError
};
