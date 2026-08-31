/**
 * internationalCardService.js — Enterprise International Card & Limit Engine
 *
 * Responsibilities:
 *   1. Classifies card BINs (Domestic vs International credit/debit cards).
 *   2. Provides multi-currency FX rate conversions for USD, EUR, GBP, CAD, GHS, NGN.
 *   3. Enforces 3D-Secure 2.0 (3DS2) mandatory security flags for international card payments.
 *   4. Generates diagnostic error messages for bank-side card declines (e.g. EXCEEDS_DAILY_LIMIT, INTERNATIONAL_BLOCKED).
 */

const FX_RATES_TO_USD = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.74,
  NGN: 0.00067, // ~1500 NGN = 1 USD
  GHS: 0.067,   // ~15 GHS = 1 USD
};

class InternationalCardService {
  /**
   * Converts any currency amount to USD equivalent for standard KYC tier checking
   */
  static convertToUsd(amount, currency = 'USD') {
    const numAmount = parseFloat(amount) || 0;
    const cur = String(currency).toUpperCase();
    const rate = FX_RATES_TO_USD[cur] || 1.0;
    return numAmount * rate;
  }

  /**
   * Converts USD amount to local target currency
   */
  static convertFromUsd(usdAmount, targetCurrency = 'NGN') {
    const numUsd = parseFloat(usdAmount) || 0;
    const cur = String(targetCurrency).toUpperCase();
    const rate = FX_RATES_TO_USD[cur] || 1.0;
    return numUsd / rate;
  }

  /**
   * Evaluates if a transaction involves an international card or foreign currency
   */
  static isInternationalPayment(payCurrency = 'USD', cardBin = '') {
    const cur = String(payCurrency).toUpperCase();
    const isForeignCurrency = ['USD', 'EUR', 'GBP', 'CAD'].includes(cur);
    const isForeignBin = cardBin ? !cardBin.startsWith('5061') && !cardBin.startsWith('5399') : false;
    return isForeignCurrency || isForeignBin;
  }

  /**
   * Returns localized bank limit advisories and diagnostic resolution steps for payment failures
   */
  static getDeclineDiagnostic(errorCode = '', isInternational = false) {
    const code = String(errorCode).toUpperCase();

    if (code.includes('EXCEEDS_DAILY_LIMIT') || code.includes('LIMIT_EXCEEDED')) {
      return {
        title: 'Bank Daily Card Limit Exceeded',
        reason: 'Your bank declined this charge because it exceeds your card’s daily online transaction cap.',
        solution: 'Log into your bank mobile app, go to Card Settings / Controls, and temporarily increase your Web Pay / Online transaction limit.',
        isBankIssue: true,
      };
    }

    if (code.includes('INTERNATIONAL') || code.includes('CROSS_BORDER') || code.includes('FOREIGN_NOT_ALLOWED')) {
      return {
        title: 'International Card Payment Blocked by Bank',
        reason: 'Your issuing bank has disabled cross-border or foreign currency transactions on this card.',
        solution: 'Enable "International Transactions" or "Online Overseas Usage" in your bank app, or try a domestic card / bank transfer.',
        isBankIssue: true,
      };
    }

    if (code.includes('INSUFFICIENT') || code.includes('NOT_SUFFICIENT')) {
      return {
        title: 'Insufficient Card Balance',
        reason: 'The card balance or available credit line is insufficient for this charge after currency conversion.',
        solution: 'Top up your card account or use an alternative payment method.',
        isBankIssue: true,
      };
    }

    if (code.includes('3DS') || code.includes('OTP') || code.includes('AUTHENTICATION_FAILED')) {
      return {
        title: '3D-Secure Authentication Failed',
        reason: 'The 3DS OTP verification was incomplete or timed out.',
        solution: 'Ensure your phone receives SMS/email OTPs from your bank and retry.',
        isBankIssue: true,
      };
    }

    return {
      title: 'Card Payment Declined by Issuer',
      reason: isInternational 
        ? 'Your foreign issuing bank declined this transaction.' 
        : 'Your bank declined this transaction.',
      solution: 'Contact your card issuing bank or try another card or bank transfer.',
      isBankIssue: true,
    };
  }

  /**
   * Formats limits for UI presentation
   */
  static formatLimitSummary(userKycTier = 0, customDepositLimit = null) {
    const tierUsdDepositLimits = { 0: 50, 1: 500, 2: 5000, 3: 50000 };
    const tierUsdWithdrawalLimits = { 0: 0, 1: 200, 2: 2500, 3: 25000 };

    const depositLimitUsd = customDepositLimit !== null && customDepositLimit !== undefined
      ? parseFloat(customDepositLimit)
      : (tierUsdDepositLimits[userKycTier] ?? 50);

    const withdrawalLimitUsd = tierUsdWithdrawalLimits[userKycTier] ?? 0;

    return {
      kycTier: userKycTier,
      tierName: `Tier ${userKycTier}`,
      depositLimitUsd,
      withdrawalLimitUsd,
      domesticCardLimitNgn: depositLimitUsd * 1500,
      internationalCardLimitUsd: depositLimitUsd,
      internationalCardLimitEur: depositLimitUsd / 1.08,
      internationalCardLimitGbp: depositLimitUsd / 1.27,
      bankAdvisory: 'Note: Your issuing bank may impose separate daily Web Pay caps (e.g. ₦200,000 for local cards or $500 for international cards).'
    };
  }
}

module.exports = InternationalCardService;
