const path = require("path");
const PaystackProvider = require(
  path.join(__dirname, "providers", "PaystackProvider"),
);
const FincraProvider = require(
  path.join(__dirname, "providers", "FincraProvider"),
);
const NowPaymentsProvider = require(
  path.join(__dirname, "providers", "NowPaymentsProvider"),
);
const GreyProvider = require(
  path.join(__dirname, "providers", "GreyProvider"),
);
const logger = require("../../utils/logger");
const currencyConfig = require("../../config/currencyConfig");

class PaymentFactory {
   /**
   * Get provider based on currency, region and options
   */
  static getProvider(currency, region = "NG", isCrypto = false, method = "card") {
    if (!currency) {
      console.warn("[PaymentFactory] Missing currency, defaulting to NGN for provider selection");
      return new PaystackProvider();
    }
    
    const upCurrency = currency.toUpperCase();

    // 1. Crypto Logic
    if (
      isCrypto ||
      ["BTC", "USDT", "ETH", "USDC", "MATIC"].some((c) =>
        upCurrency.startsWith(c)
      )
    ) {
      const cryptoProvider = (process.env.CRYPTO_PROVIDER || "nowpayments")
        .toLowerCase();

      logger.info(
        `PaymentFactory: Selecting crypto provider: ${cryptoProvider}`,
      );

      switch (cryptoProvider) {
        case "nowpayments":
          return new NowPaymentsProvider();
        default:
          logger.warn(
            `Unknown crypto provider '${cryptoProvider}', falling back to NowPayments`,
          );
          return new NowPaymentsProvider();
      }
    }

    // 2. NGN — always Paystack natively
    if (upCurrency === "NGN") {
      return new PaystackProvider();
    }

    // 3. USD, EUR, GBP — method-dependent routing
    if (["USD", "EUR", "GBP"].includes(upCurrency)) {
      if (method === "bank_transfer" || method === "manual") {
        logger.info(`PaymentFactory: Selecting Grey provider for ${upCurrency} ${method}`);
        return new GreyProvider();
      }
      // Card / Checkout flow: Paystack
      // EUR and GBP will have been pre-converted to USD by depositService via gatewayOptions.
      // The transaction record still carries the original currency (EUR/GBP) for ledger accuracy.
      logger.info(`PaymentFactory: Selecting Paystack for ${upCurrency} card payment (pre-converted to USD if needed)`);
      return new PaystackProvider();
    }

    // 4. JPY — card deposits are pre-converted to USD by depositService before reaching here.
    //    Bank transfers are blocked upstream in depositService with a friendly message.
    //    The factory routes JPY card payments to Paystack, which will receive the USD
    //    amount/currency via gatewayOptions (not the raw JPY).
    if (upCurrency === "JPY") {
      if (method === "bank_transfer") {
        // This case should already be blocked in depositService.
        // If it reaches here, it means the caller bypassed the upstream guard.
        logger.error(`[PaymentFactory] JPY bank_transfer reached factory — this should have been blocked in depositService.`);
        throw new Error(
          currencyConfig.getBankTransferSupport("JPY").message ||
          "JPY bank transfers are not supported. Please use USD."
        );
      }
      logger.info(`PaymentFactory: Routing JPY card payment via Paystack (pre-converted to USD by depositService)`);
      return new PaystackProvider();
    }

    // 5. Other cross-border fiat (KES, GHS, etc.) — route via Paystack.
    //    depositService is responsible for pre-converting these to USD.
    logger.info(`PaymentFactory: Fallback — routing ${upCurrency} to Paystack (caller must pre-convert via gatewayOptions)`);
    return new PaystackProvider();
  }

  /**
   * Get provider by explicit name (useful for webhooks/polling)
   */
  static getProviderByName(name) {
    if (!name) throw new Error("Provider name is required");

    switch (name.toLowerCase()) {
      case "paystack":
        return new PaystackProvider();
      case "fincra":
        return new FincraProvider();
      case "nowpayments":
      case "crypto": // Legacy alias
        return new NowPaymentsProvider();
      case "grey":
      case "manual":
        return new GreyProvider();

      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }
}

module.exports = PaymentFactory;
