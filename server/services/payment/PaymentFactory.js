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
        // Future: case "coinbase": return new CoinbaseProvider();
        default:
          logger.warn(
            `Unknown crypto provider '${cryptoProvider}', falling back to NowPayments`,
          );
          return new NowPaymentsProvider();
      }
    }

    // 2. Region & Currency logic for Fiat
    if (upCurrency === "NGN") {
      return new PaystackProvider();
    }

    // Use Grey for core USD, EUR, GBP manual bank transfers
    if (["USD", "EUR", "GBP"].includes(upCurrency)) {
      if (method === "bank_transfer" || method === "manual") {
        logger.info(`PaymentFactory: Selecting Grey provider for ${upCurrency} ${method}`);
        return new GreyProvider();
      }
      
      // Card / Checkout flow: Route to Paystack (will handle auto-conversion if needed)
      logger.info(`PaymentFactory: Selecting Paystack for ${upCurrency} card payment`);
      return new PaystackProvider();
    }

    if (
      [
        "JPY",
        "KES",
        "GHS",
        "UGX",
        "ZAR",
        "TZS",
        "XAF",
        "XOF",
        "EGP",
        "CAD",
      ].includes(upCurrency)
    ) {
      // Route all supported cross-border fiat to Paystack (Fincra is deprecated)
      return new PaystackProvider();
    }

    // 3. Fallback for other cross-border flows
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
