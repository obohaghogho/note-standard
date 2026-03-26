const axios = require("axios");
const crypto = require("crypto");
const logger = require("../../utils/logger");

const FINCRA_SECRET_KEY = process.env.FINCRA_SECRET_KEY;
const FINCRA_BUSINESS_ID = process.env.FINCRA_BUSINESS_ID;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL ||
  "https://api.nowpayments.io/v1";

// Default timeout for API calls (15 seconds)
const API_TIMEOUT = 15000;
const api = axios.create({
  timeout: API_TIMEOUT,
});

// Dynamically set Fincra base URL based on key pattern
const FINCRA_BASE_URL = (FINCRA_SECRET_KEY && FINCRA_SECRET_KEY.length < 40)
  ? "https://sandboxapi.fincra.com"
  : "https://api.fincra.com";

class PayoutService {
  /**
   * Initiate a fiat payout via Fincra Disbursement API
   * https://docs.fincra.com/docs/payouts
   */
  async createFincraTransfer(
    bankCode,
    accountNumber,
    amount,
    currency,
    reference,
    narration = "Withdrawal",
    options = {},
  ) {
    if (!FINCRA_SECRET_KEY || !FINCRA_BUSINESS_ID) {
      throw new Error("Fincra configuration missing (secret key or business ID)");
    }

    try {
      const accountName = options.accountName || "Account Holder";
      const country = options.country || (currency === "NGN" ? "NG" : "US");

      const response = await api.post(
        `${FINCRA_BASE_URL}/disbursements/payouts`,
        {
          sourceCurrency: currency,
          destinationCurrency: currency,
          amount: parseFloat(amount),
          business: FINCRA_BUSINESS_ID,
          description: narration,
          customerReference: reference,
          beneficiary: {
            firstName: accountName.split(" ")[0] || "Account",
            lastName: accountName.split(" ").slice(1).join(" ") || "Holder",
            email: options.email || "user@notestandard.com",
            type: "individual",
            accountHolderName: accountName,
            accountNumber: accountNumber,
            bankCode: bankCode,
            country: country,
            sortCode: options.branchCode || options.swiftCode || undefined,
          },
          paymentDestination: "bank_account",
        },
        {
          headers: {
            "api-key": FINCRA_SECRET_KEY,
            "x-business-id": FINCRA_BUSINESS_ID,
            "Content-Type": "application/json",
          },
        },
      );

      const respData = response.data?.data || response.data || {};

      return {
        success: true,
        payoutId: respData.id || respData.reference || reference,
        status: respData.status || "PROCESSING",
        provider: "FINCRA",
      };
    } catch (error) {
      logger.error(
        "[PayoutService] Fincra Transfer Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        `Fincra payout failed: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }

  /**
   * Initiate a crypto payout via NOWPayments
   * https://documenter.getpostman.com/view/7907941/S1a32n38?version=latest#12d83296-6e5a-4cb7-9952-bf60a1e053a2
   */
  async createNowPaymentsPayout(
    address,
    amount,
    currency,
    reference,
    network = "native",
  ) {
    if (!NOWPAYMENTS_API_KEY) {
      throw new Error("NOWPayments configuration missing");
    }

    // Note: NOWPayments requires 2FA or IP whitelisting for payouts
    // Ensure the production server IP is whitelisted in the NOWPayments dashboard under Store Settings -> Payouts

    // Some NOWPayments endpoints expect 'btc' instead of 'BTC'
    const payCurrencyMap = {
      "BTC_BITCOIN": "btc",
      "ETH_ETHEREUM": "eth",
      "USDT_TRC20": "usdttrc20",
      "USDT_ERC20": "usdterc20",
      "USDT_BEP20": "usdtbsc",
      "USDC_ERC20": "usdcerc20",
      "USDC_POLYGON": "usdcmatictoken",
    };

    const lookupKey = `${currency.toUpperCase()}_${
      (network || "native").toUpperCase()
    }`;
    const payCurrency = payCurrencyMap[lookupKey] || currency.toLowerCase();

    try {
      // Step 1: Request withdrawal
      const response = await api.post(
        `${NOWPAYMENTS_API_URL}/payout`,
        {
          withdrawals: [
            {
              address: address,
              currency: payCurrency,
              amount: amount,
              ipn_callback_url:
                `${process.env.SERVER_URL}/api/webhooks/nowpayments`,
            },
          ],
        },
        {
          headers: {
            "x-api-key": NOWPAYMENTS_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );

      const withdrawal = response.data.withdrawals[0];

      return {
        success: true,
        payoutId: withdrawal.id, // NOWPayments batch ID
        status: withdrawal.status, // e.g., 'CREATING', 'PROCESSING'
        provider: "NOWPAYMENTS",
      };
    } catch (error) {
      logger.error(
        "[PayoutService] NOWPayments Payout Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        `NOWPayments payout failed: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }

  /**
   * Initiate a crypto-to-crypto conversion via NOWPayments
   * uses /v1/exchange or similar conversion-enabled payout flows
   */
  async createNowPaymentsConversion(
    fromCurrency,
    toCurrency,
    amount,
    reference,
    fromNetwork = "native",
    toNetwork = "native",
  ) {
    if (!NOWPAYMENTS_API_KEY) {
      throw new Error("NOWPayments configuration missing");
    }

    const payCurrencyMap = {
      "BTC_BITCOIN": "btc",
      "ETH_ETHEREUM": "eth",
      "USDT_TRC20": "usdttrc20",
      "USDT_ERC20": "usdterc20",
      "USDT_BEP20": "usdtbsc",
      "USDC_ERC20": "usdcerc20",
      "USDC_POLYGON": "usdcmatictoken",
    };

    const fromKey = `${fromCurrency.toUpperCase()}_${
      (fromNetwork || "native").toUpperCase()
    }`;
    const toKey = `${toCurrency.toUpperCase()}_${
      (toNetwork || "native").toUpperCase()
    }`;

    const fromTicker = payCurrencyMap[fromKey] || fromCurrency.toLowerCase();
    const toTicker = payCurrencyMap[toKey] || toCurrency.toLowerCase();

    try {
      // REQUIREMENT: Facilitate conversion via NOWPayments
      // In License-Light, we use the Exchange API to swap funds
      const response = await api.post(
        `${NOWPAYMENTS_API_URL}/exchange`,
        {
          from_currency: fromTicker,
          to_currency: toTicker,
          amount: amount,
          // Note: In some plans, conversion requires an address to send TO
          // For internal facilitation, we might send to a platform-managed interim address
          // or directly swap. Assuming exchange-to-payout flow.
          extra_id: reference,
        },
        {
          headers: {
            "x-api-key": NOWPAYMENTS_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );

      return {
        success: true,
        conversionId: response.data.id || `conv_${Date.now()}`,
        status: response.data.status || "processing",
        provider: "NOWPAYMENTS",
      };
    } catch (error) {
      logger.error(
        "[PayoutService] NOWPayments Conversion Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        `NowPayments conversion failed: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }
}

module.exports = new PayoutService();
