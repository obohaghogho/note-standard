/**
 * Fincra Payout Provider Implementation
 * ───────────────────────────────────────
 * Implements PayoutProvider for Fincra Live/Sandbox API via the Gateway Router.
 * Supports OTP Challenge verification and resend flow.
 */

const { PayoutProvider } = require("./PayoutProvider");
const { getFincraClient } = require("../services/fincra/client");
const verification       = require("../services/fincra/verification");
const logger             = require("../utils/logger");

class FincraProvider extends PayoutProvider {
  constructor() {
    super("fincra", {
      supportsNGN:                 true,
      supportsUSD:                 true,
      supportsEUR:                 true,
      supportsWebhook:             true,
      supportsAccountVerification: true,
      supportsMerchantBalance:     true,
      maxTransactionAmountNGN:     50000000,
    });
  }

  /**
   * Resolve bank account number and return account name.
   */
  async resolveAccount({ accountNumber, bankCode, currency = "NGN", userId }) {
    return await verification.verifyBankAccount({ accountNumber, bankCode, currency, userId });
  }

  /**
   * Initiate payout to Fincra API.
   * Detects whether Fincra returns an OTP challenge.
   */
  async initiatePayout({ amount, currency, bankCode, accountNumber, accountName, narration, reference }) {
    const { instance, businessId } = getFincraClient();

    const payload = {
      sourceCurrency:      currency.toUpperCase(),
      destinationCurrency: currency.toUpperCase(),
      amount:              parseFloat(amount),
      description:         narration || `NoteStandard withdrawal ${reference}`,
      customerReference:   reference,
      beneficiary: {
        name:          accountName,
        accountNumber,
        type:          "individual",
        bankCode,
      },
    };

    logger.info(`[FincraProvider] Submitting payout payload for ${reference}`, { amount, currency });

    const res = await instance.post("/disbursements/payouts", payload);
    logger.info(`[FincraProvider] Raw payout response for ${reference}:`, res.data);

    const dataObj = res.data?.data || res.data || {};
    const fincraRef = dataObj.reference || dataObj.id || res.data?.reference;
    const rawStatus = String(dataObj.status || res.data?.status || "").toLowerCase();
    const rawMessage = String(res.data?.message || dataObj.message || "").toLowerCase();

    const isOtpRequired =
      rawStatus.includes("otp") ||
      dataObj.otpRequired === true ||
      rawMessage.includes("otp");

    return {
      success:          true,
      fincraReference:  fincraRef,
      otpRequired:      isOtpRequired,
      status:           isOtpRequired ? "OTP_REQUIRED" : (dataObj.status || "PROCESSING"),
      providerResponse: res.data,
    };
  }

  /**
   * Verify OTP for a pending payout challenge.
   */
  async verifyOtp({ fincraReference, otp, withdrawalReference }) {
    const { instance } = getFincraClient();
    const targetRef = fincraReference || withdrawalReference;
    const payload = {
      reference: targetRef,
      otp: String(otp).trim(),
    };

    logger.info(`[FincraProvider] Submitting OTP verification for ${targetRef}`);

    try {
      const res = await instance.post("/disbursements/payouts/otp", payload);
      logger.info(`[FincraProvider] OTP verification response for ${targetRef}:`, res.data);
      return {
        success: true,
        status: res.data?.data?.status || "PROCESSING",
        providerResponse: res.data,
      };
    } catch (err) {
      logger.warn(`[FincraProvider] Primary OTP endpoint failed for ${targetRef}, trying secure endpoint: ${err.message}`);
      try {
        const res = await instance.post("/disbursements/payouts/secure", payload);
        logger.info(`[FincraProvider] Secure OTP response for ${targetRef}:`, res.data);
        return {
          success: true,
          status: res.data?.data?.status || "PROCESSING",
          providerResponse: res.data,
        };
      } catch (fallbackErr) {
        const msg = fallbackErr.response?.data?.message || err.response?.data?.message || err.message || "Invalid or expired OTP.";
        logger.error(`[FincraProvider] OTP verification failed for ${targetRef}: ${msg}`);
        throw new Error(msg);
      }
    }
  }

  /**
   * Resend OTP for a pending payout challenge.
   */
  async resendOtp({ fincraReference, withdrawalReference }) {
    const { instance } = getFincraClient();
    const targetRef = fincraReference || withdrawalReference;
    const payload = { reference: targetRef };

    logger.info(`[FincraProvider] Requesting OTP resend for ${targetRef}`);

    try {
      const res = await instance.post("/disbursements/payouts/resend-otp", payload);
      logger.info(`[FincraProvider] Resend OTP response for ${targetRef}:`, res.data);
      return {
        success: true,
        message: res.data?.message || "OTP resent successfully.",
      };
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to resend OTP.";
      logger.error(`[FincraProvider] Resend OTP error for ${targetRef}: ${msg}`);
      throw new Error(msg);
    }
  }

  /**
   * Verify payout status directly from Fincra API.
   */
  async verifyPayout(reference) {
    const { instance } = getFincraClient();
    const res = await instance.get(`/disbursements/payouts/${reference}`);
    const status = res.data?.data?.status || "UNKNOWN";
    return {
      status,
      rawResponse: res.data,
    };
  }

  /**
   * Get Fincra merchant account balance for pre-check.
   */
  async getMerchantBalance(currency = "NGN") {
    try {
      const { instance, businessId } = getFincraClient();
      const res = await instance.get(`/accounts/business/${businessId}`);
      const accounts = res.data?.data || [];
      const match = accounts.find(a => String(a.currency).toUpperCase() === currency.toUpperCase());

      return {
        available: parseFloat(match?.availableBalance || match?.balance || 0),
        currency:  currency.toUpperCase(),
      };
    } catch (err) {
      logger.warn(`[FincraProvider] Merchant balance fetch warning: ${err.message}`);
      return { available: 99999999, currency: currency.toUpperCase() };
    }
  }
}

module.exports = FincraProvider;
