const crypto = require("crypto");

/**
 * Canary Rollout Utilities (DFOS v6.0)
 * Implements a hybrid rotation model: Stable Weekly Cohort + Dynamic Daily Sampling.
 */
class CanaryUtils {
  /**
   * Deterministically determines if a user is in the Canary bucket.
   * Stability: Weekly (90%), Daily (10% of canary group)
   */
  isCanary(userId, stablePercentage = 10, dynamicPercentage = 1) {
    if (!userId) return false;

    // 1. Stable Batch (Weekly Epoch)
    // Ensures User-Symmetry during evaluation sessions
    const now = new Date();
    const weekEpoch = `${now.getUTCFullYear()}-W${Math.floor(now.getUTCDate() / 7)}`;
    const weekHash = crypto.createHash("sha256")
      .update(`${userId}:${weekEpoch}:canary_v6_stable`)
      .digest("hex");
    
    // Scale hash to [0, 100]
    const weekScore = parseInt(weekHash.substring(0, 8), 16) % 100;
    if (weekScore < stablePercentage) return true;

    // 2. Dynamic Sampling (Daily Epoch)
    // Prevents "Permanent Test Subject" syndrome and cohort bias
    const dayEpoch = now.toISOString().split("T")[0];
    const dayHash = crypto.createHash("sha256")
      .update(`${userId}:${dayEpoch}:canary_v6_dynamic`)
      .digest("hex");
    
    const dayScore = parseInt(dayHash.substring(0, 8), 16) % 100;
    if (dayScore < dynamicPercentage) return true;

    return false;
  }
}

module.exports = new CanaryUtils();
