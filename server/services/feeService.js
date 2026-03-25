const env = require("../config/env");
const math = require("../utils/mathUtils");

/**
 * Fee Service
 * Configurable production fee rules.
 */
class FeeService {
  /**
   * Calculate inclusive fee breakdown
   */
  calculateFees(amount, currency, hasReferrer = false) {
    const gross = String(amount);

    const adminRate = env.ADMIN_FEE_RATE || math.ADMIN_FEE_RATE;
    const partnerRate = env.PARTNER_FEE_RATE || math.PARTNER_FEE_RATE;
    const referrerRate = hasReferrer ? (env.REFERRAL_FEE_RATE || math.REFERRAL_FEE_RATE) : "0";

    const adminFee = math.multiply(gross, adminRate);
    const partnerAward = math.multiply(gross, partnerRate);
    const referrerFee = math.multiply(gross, referrerRate);

    // Summing BigNumbers safely
    const totalFeeBN = math.parseSafe(adminFee).add(math.parseSafe(partnerAward)).add(math.parseSafe(referrerFee));
    const totalFee = math.formatSafe(totalFeeBN);

    const netAmountBN = math.parseSafe(gross).sub(totalFeeBN);
    const netAmount = math.formatSafe(netAmountBN);

    return {
      grossAmount: gross,
      adminFee,
      partnerAward,
      referrerFee,
      totalFee,
      netAmount,
      currency,
      breakdown: {
        admin_fee: adminFee,
        partner_reward: partnerAward,
        referrer: referrerFee,
      },
      rates: {
        admin: adminRate,
        partner: partnerRate,
        referrer: referrerRate,
        total: math.formatSafe(math.parseSafe(adminRate).add(math.parseSafe(partnerRate)).add(math.parseSafe(referrerRate))),
      },
    };
  }
}

module.exports = new FeeService();
