const path = require("path");
const PaystackProvider = require(
  path.join(__dirname, "providers", "PaystackProvider"),
);
const FlutterwaveProvider = require(
  path.join(__dirname, "providers", "FlutterwaveProvider"),
);
const FincraProvider = require(
  path.join(__dirname, "providers", "FincraProvider"),
);
const NowPaymentsProvider = require(
  path.join(__dirname, "providers", "NowPaymentsProvider"),
);
const logger = require("../../utils/logger");

class PaymentFactory {
  /**
   * Get provider based on currency, region and options
   */
  static getProvider(currency, region = "NG", isCrypto = false) {
    // 1. Crypto Logic
    if (
      isCrypto ||
      ["BTC", "USDT", "ETH", "USDC", "MATIC"].some((c) =>
        currency.toString().toUpperCase().startsWith(c)
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
    if (currency === "NGN") {
      return new PaystackProvider();
    }

    if (
      [
        "USD",
        "GBP",
        "EUR",
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
      ].includes(currency)
    ) {
      return new FlutterwaveProvider();
    }

    // 3. Fallback for other cross-border flows
    return new FincraProvider();
  }

  /**
   * Get provider by explicit name (useful for webhooks/polling)
   */
  static getProviderByName(name) {
    if (!name) throw new Error("Provider name is required");

    switch (name.toLowerCase()) {
      case "paystack":
        return new PaystackProvider();
      case "flutterwave":
        return new FlutterwaveProvider();
      case "fincra":
        return new FincraProvider();
      case "nowpayments":
      case "crypto": // Legacy alias
        return new NowPaymentsProvider();

      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }
}

module.exports = PaymentFactory;
