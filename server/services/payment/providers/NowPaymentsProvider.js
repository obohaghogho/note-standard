const BaseProvider = require("./BaseProvider");
const nowpaymentsService = require("../../nowpaymentsService");
const logger = require("../../../utils/logger");

class NowPaymentsProvider extends BaseProvider {
  constructor() {
    super();
    this.providerName = "nowpayments";
  }

  /**
   * Initialize crypto payment link
   */
  async initialize(data) {
    const { amount, currency, network, reference, callbackUrl, metadata } =
      data;

    try {
      // Derive payCurrency from currency and network
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
      const payCurrency = metadata.payCurrency || payCurrencyMap[lookupKey] ||
        currency.toLowerCase();

      const paymentData = await nowpaymentsService.createNowPaymentsPayment({
        amount,
        currency,
        orderId: reference,
        orderDescription: `Digital Assets Purchase: ${currency} (${network})`,
        ipnCallbackUrl: process.env.NOWPAYMENTS_WEBHOOK_URL || callbackUrl,
        payCurrency: payCurrency,
      });

      return {
        checkoutUrl: paymentData.checkout_url,
        providerReference: paymentData.payment_id,
        payAddress: paymentData.pay_address,
        payAmount: paymentData.pay_amount,
        paymentUrl: paymentData.checkout_url,
      };
    } catch (error) {
      logger.error("NowPaymentsProvider: Initialization Failed", {
        message: error.message,
        reference,
      });
      throw error;
    }
  }

  /**
   * Status check by provider reference
   */
  async verify(reference) {
    try {
      const data = await nowpaymentsService.getPaymentStatus(reference);

      let status = "pending";
      if (["finished", "confirmed"].includes(data.payment_status)) {
        status = "success";
      } else if (["failed", "expired"].includes(data.payment_status)) {
        status = "failed";
      }

      return {
        success: status === "success",
        status: status,
        amount: data.price_amount,
        currency: data.price_currency,
        reference: data.order_id,
        provider: "nowpayments",
        raw: data,
      };
    } catch (error) {
      logger.error("NowPaymentsProvider: Status Verification Failed", {
        message: error.message,
        reference,
      });
      throw error;
    }
  }

  /**
   * Webhook Signature Check (Delegated to specialized service)
   */
  verifyWebhookSignature(headers, body, rawBody = null) {
    return nowpaymentsService.verifyIPNSignature(headers, body, rawBody);
  }

  /**
   * Parse NowPayments IPN payload into internal format
   */
  parseWebhookEvent(payload) {
    const paymentStatus = payload.payment_status;
    let status = "pending";

    if (["finished", "confirmed"].includes(paymentStatus)) status = "success";
    else if (["failed", "expired"].includes(paymentStatus)) status = "failed";

    return {
      type: "Digital Assets Purchase",
      display_label: "Digital Assets Purchase",
      reference: payload.order_id || payload.payment_id,
      status: status,
      amount: payload.price_amount,
      currency: payload.price_currency,
      userId: payload.order_id?.split("_")[0],
      internal_coin: payload.pay_currency,
      internal_amount: payload.pay_amount,
      raw: payload,
    };
  }
}

module.exports = NowPaymentsProvider;
