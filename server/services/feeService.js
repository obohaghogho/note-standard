/**
 * Fee Service
 * Standard production fee rules: 6% Admin, 1% Partner, 0.5% Referrer.
 */
class FeeService {
  /**
   * Calculate inclusive fee breakdown
   */
  calculateFees(amount, currency) {
    const gross = parseFloat(amount);

    const adminFee = gross * 0.06;
    const partnerAward = gross * 0.01;
    const referrerFee = gross * 0.005;

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
        admin: 0.06,
        partner: 0.01,
        referrer: 0.005,
        total: 0.075,
      },
    };
  }
}

module.exports = new FeeService();
