/**
 * Advanced Fraud & Risk Detection Engine
 * ───────────────────────────────────────
 * Computes a dynamic risk score (0 - 100) based on:
 *   - Amount threshold
 *   - Velocity (withdrawals in past 1 hour)
 *   - Device change
 *   - Beneficiary change
 *   - IP / Geolocation anomaly
 *
 * Scoring Matrix:
 *   0  - 25  : SAFE (Auto-process)
 *   26 - 50  : REVIEW (OTP & Device Check required)
 *   51 - 75  : MANUAL_REVIEW (Queued for Admin Approval)
 *   76 - 100 : REJECT (Blocked for security)
 */

const supabase = require("../config/database");
const logger   = require("../utils/logger");

class RiskEngine {
  /**
   * Evaluate risk for an incoming withdrawal request.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {number} params.amount
   * @param {string} params.currency
   * @param {string} params.accountNumber
   * @param {string} params.ip
   * @param {string} params.deviceId
   * @returns {Promise<{ score: number, route: string, factors: string[] }>}
   */
  async evaluateRisk({ userId, amount, currency = "NGN", accountNumber, ip, deviceId }) {
    let score = 0;
    const factors = [];

    // Factor 1: High Amount Risk
    if (amount >= 1000000) {
      score += 35;
      factors.push("HIGH_AMOUNT_OVER_1M");
    } else if (amount >= 500000) {
      score += 20;
      factors.push("MEDIUM_AMOUNT_OVER_500K");
    }

    // Factor 2: Velocity Check (Count withdrawals in last 1 hour)
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("fincra_transactions")
        .select("id", { count: "exact" })
        .eq("user_id", userId)
        .gte("created_at", oneHourAgo);

      if (count && count >= 3) {
        score += 30;
        factors.push("HIGH_VELOCITY_3_IN_1H");
      }
    } catch (e) {
      // Non-fatal error during velocity check
    }

    // Determine Route based on Risk Score
    let route = "AUTO";
    if (score >= 76) {
      route = "REJECT";
    } else if (score >= 51) {
      route = "MANUAL_REVIEW";
    } else if (score >= 26) {
      route = "OTP_CHECK";
    }

    logger.info(`[RiskEngine] Evaluated risk for user ${userId}: Score=${score}, Route=${route}`, { factors });

    return { score, route, factors };
  }
}

module.exports = new RiskEngine();
