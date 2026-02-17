const PaystackProvider = require("./providers/PaystackProvider");
const FlutterwaveProvider = require("./providers/FlutterwaveProvider");
const KorapayProvider = require("./providers/KorapayProvider");
const NowPaymentsProvider = require("./providers/NowPaymentsProvider");
const logger = require("../../utils/logger");

class PaymentFactory {
  /**
   * Get provider based on currency, region and options
   */
  static getProvider(currency, region = "NG", isCrypto = false) {
    // 1. Crypto Logic
    if (
      isCrypto || ["BTC", "USDT", "ETH", "USDC", "MATIC"].includes(currency)
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

    if (["USD", "GBP", "EUR"].includes(currency)) {
      return new FlutterwaveProvider();
    }

    // 3. Fallback for other cross-border flows
    return new KorapayProvider();
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
      case "korapay":
        return new KorapayProvider();
      case "nowpayments":
      case "crypto": // Legacy alias
        return new NowPaymentsProvider();

      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }
}

module.exports = PaymentFactory;
