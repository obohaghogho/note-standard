const env = require("../config/env");

/**
 * Fee Service
 * Configurable production fee rules.
 */
class FeeService {
  /**
   * Calculate inclusive fee breakdown
   */
  calculateFees(amount, currency) {
    const gross = parseFloat(amount);

    const adminRate = env.ADMIN_FEE_RATE;
    const partnerRate = env.PARTNER_FEE_RATE;
    const referrerRate = env.REFERRAL_FEE_RATE;

    const adminFee = gross * adminRate;
    const partnerAward = gross * partnerRate;
    const referrerFee = gross * referrerRate;

    const totalFee = adminFee + partnerAward + referrerFee;
    const netAmount = gross - totalFee;

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
        total: adminRate + partnerRate + referrerRate,
      },
    };
  }
}

module.exports = new FeeService();
