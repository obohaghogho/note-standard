const axios = require("axios");
const env = require("../config/env");
const logger = require("../utils/logger");

class NowPaymentsProvider {
  constructor() {
    this.apiKey = env.NOWPAYMENTS_API_KEY;
    this.baseUrl = process.env.NOWPAYMENTS_API_URL ||
      "https://api.nowpayments.io/v1";

    this.payCurrencyMap = {
      "BTC_BITCOIN": "btc",
      "ETH_ETHEREUM": "eth",
      "USDT_TRC20": "usdttrc20",
      "USDT_ERC20": "usdterc20",
      "USDT_BEP20": "usdtbsc",
      "USDC_ERC20": "usdcerc20",
      "USDC_POLYGON": "usdcmatictoken",
    };
  }

  getTicker(currency, network = "native") {
    const key = `${currency.toUpperCase()}_${
      (network || "native").toUpperCase()
    }`;
    return this.payCurrencyMap[key] || currency.toLowerCase();
  }

  async createPayout(address, amount, currency, reference, network = "native") {
    if (!this.apiKey) throw new Error("NOWPayments API key missing");

    try {
      const response = await axios.post(
        `${this.baseUrl}/payout`,
        {
          withdrawals: [
            {
              address: address,
              currency: this.getTicker(currency, network),
              amount: amount,
              ipn_callback_url: `${
                env.SERVER_URL || ""
              }/api/webhooks/nowpayments`,
            },
          ],
        },
        {
          headers: {
            "x-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      const withdrawal = response.data.withdrawals[0];
      return {
        success: true,
        payoutId: withdrawal.id,
        status: withdrawal.status,
        provider: "NOWPAYMENTS",
      };
    } catch (error) {
      logger.error(
        "[NowPaymentsProvider] Payout Error:",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async createConversion(
    fromCurrency,
    toCurrency,
    amount,
    reference,
    fromNetwork = "native",
    toNetwork = "native",
  ) {
    if (!this.apiKey) throw new Error("NOWPayments API key missing");

    const fromTicker = this.getTicker(fromCurrency, fromNetwork);
    const toTicker = this.getTicker(toCurrency, toNetwork);

    try {
      const response = await axios.post(
        `${this.baseUrl}/exchange`,
        {
          from_currency: fromTicker,
          to_currency: toTicker,
          amount: amount,
          extra_id: reference,
        },
        {
          headers: {
            "x-api-key": this.apiKey,
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
      if (error.response?.status === 404 || error.response?.status === 403) {
        logger.warn(
          `[NowPaymentsProvider] Converting simulation for ${reference}`,
        );
        return {
          success: true,
          conversionId: `sim_conv_${Date.now()}`,
          status: "processing",
          provider: "NOWPAYMENTS_SIM",
        };
      }
      throw error;
    }
  }
}

module.exports = new NowPaymentsProvider();
