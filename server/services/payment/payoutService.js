const axios = require("axios");
const crypto = require("crypto");
const logger = require("../../utils/logger");

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL ||
  "https://api.nowpayments.io/v1";

class PayoutService {
  /**
   * Initiate a fiat payout via Flutterwave
   * https://developer.flutterwave.com/reference/endpoints/transfers/
   */
  async createFlutterwaveTransfer(
    bankCode,
    accountNumber,
    amount,
    currency,
    reference,
    narration = "Withdrawal",
  ) {
    if (!FLUTTERWAVE_SECRET_KEY) {
      throw new Error("Flutterwave configuration missing");
    }

    try {
      const response = await axios.post(
        "https://api.flutterwave.com/v3/transfers",
        {
          account_bank: bankCode,
          account_number: accountNumber,
          amount: amount,
          currency: currency,
          narration: narration,
          reference: reference, // Unique transaction reference from our DB
          callback_url: `${process.env.SERVER_URL}/api/webhooks/flutterwave`,
        },
        {
          headers: {
            Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      return {
        success: true,
        payoutId: response.data.data.id,
        status: response.data.data.status, // e.g., 'NEW', 'PENDING'
        provider: "FLUTTERWAVE",
      };
    } catch (error) {
      logger.error(
        "[PayoutService] Flutterwave Transfer Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        `Flutterwave payout failed: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }

  /**
   * Initiate a crypto payout via NOWPayments
   * https://documenter.getpostman.com/view/7907941/S1a32n38?version=latest#12d83296-6e5a-4cb7-9952-bf60a1e053a2
   */
  async createNowPaymentsPayout(address, amount, currency, reference) {
    if (!NOWPAYMENTS_API_KEY) {
      throw new Error("NOWPayments configuration missing");
    }

    // Note: NOWPayments requires 2FA or IP whitelisting for payouts
    // Ensure the production server IP is whitelisted in the NOWPayments dashboard under Store Settings -> Payouts

    // Some NOWPayments endpoints expect 'btc' instead of 'BTC'
    const payCurrency = currency.toLowerCase();

    try {
      // Step 1: Request withdrawal
      const response = await axios.post(
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
   */
  async createNowPaymentsConversion(
    fromCurrency,
    toCurrency,
    amount,
    reference,
  ) {
    if (!NOWPAYMENTS_API_KEY) {
      throw new Error("NOWPayments configuration missing");
    }

    try {
      // In a real-world production setup, NOWPayments has a specific conversion/exchange endpoint
      // For this License-Light MVP structure, we simulate the API call to document the exact architectural flow
      // required: sending the request externally, getting a reference, and awaiting IPN.

      // Simulated external call
      logger.info(
        `[PayoutService] Simulating NOWPayments Conversion call for ${amount} ${fromCurrency} -> ${toCurrency}`,
      );

      return {
        success: true,
        conversionId: `conv_ext_${Date.now()}`,
        status: "processing",
        provider: "NOWPAYMENTS",
      };
    } catch (error) {
      logger.error(
        "[PayoutService] NOWPayments Conversion Error:",
        error.message,
      );
      throw new Error(`NowPayments conversion failed: ${error.message}`);
    }
  }
}

module.exports = new PayoutService();
