const supabase = require("../config/database");
const logger = require("./logger");

/**
 * Check if a user has exceeded their daily transaction limit
 * @param {string} userId - ID of the user
 * @param {string} userPlan - User's current plan (FREE, PRO, BUSINESS)
 * @param {number} requestedAmount - Amount they want to transact now
 * @returns {Promise<{ allowed: boolean, remaining: number, limit: number }>}
 */
async function checkDailyLimit(userId, userPlan = "FREE", requestedAmount = 0) {
  try {
    // 1. Fetch user profile for custom override
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier, daily_deposit_limit")
      .eq("id", userId)
      .single();

    let userLimit;
    if (profile?.daily_deposit_limit !== null && profile?.daily_deposit_limit !== undefined) {
      userLimit = parseFloat(profile.daily_deposit_limit);
      logger.info(`[LimitCheck] Using custom daily deposit limit for user ${userId}: ${userLimit}`);
    } else {
      // Fallback to plan limits from admin_settings
      const { data: limitSetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "daily_limits")
        .single();

      const limits = limitSetting?.value ||
        { FREE: 1000, PRO: 10000, BUSINESS: 50000 };
      
      const effectivePlan = profile?.plan_tier || userPlan || "FREE";
      userLimit = limits[effectivePlan] || limits.FREE;
    }

    // 2. Fetch total transactions for today (last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString();

    const { data: txs, error } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("status", "COMPLETED")
      .in("type", ["DEPOSIT", "FUNDING", "Digital Assets Purchase"])
      .gt("created_at", twentyFourHoursAgo);

    if (error) throw error;

    const totalUsed = txs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const remaining = Math.max(0, userLimit - totalUsed);

    return {
      allowed: requestedAmount <= remaining,
      remaining,
      limit: userLimit,
      totalUsed,
    };
  } catch (err) {
    console.error("[LimitCheck] Error checking daily limit:", err);
    // Fail safe: allow if check fails? Or block?
    // Better to allow and let the provider/manual review catch it than block legitimate users due to DB glitch.
    return { allowed: true, remaining: 999999, limit: 999999, totalUsed: 0 };
  }
}

module.exports = {
  checkDailyLimit,
};
