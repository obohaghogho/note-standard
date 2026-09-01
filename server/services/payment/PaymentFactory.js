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
const FlutterwaveProvider = require(
  path.join(__dirname, "providers", "FlutterwaveProvider"),
);
const StripeProvider = require(
  path.join(__dirname, "providers", "StripeProvider"),
);
const ZenithProvider = require(
  path.join(__dirname, "providers", "ZenithProvider"),
);
const MoniepointProvider = require(
  path.join(__dirname, "providers", "MoniepointProvider"),
);
const ProvidusProvider = require(
  path.join(__dirname, "providers", "ProvidusProvider"),
);
const AnchorProvider = require(
  path.join(__dirname, "providers", "AnchorProvider"),
);
const QuidaxProvider = require(
  path.join(__dirname, "providers", "QuidaxProvider"),
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
      currency = "NGN";
    }
    
    const upCurrency = currency.toUpperCase();

    // 1. Crypto Logic
    if (
      isCrypto ||
      ["BTC", "USDT", "ETH", "USDC", "MATIC"].some((c) =>
        upCurrency.startsWith(c)
      )
    ) {
      const cryptoProvider = (process.env.ACTIVE_CRYPTO_DEPOSIT_PROVIDER || process.env.CRYPTO_PROVIDER || "nowpayments")
        .toLowerCase();

      logger.info(
        `PaymentFactory: Selecting crypto provider: ${cryptoProvider}`,
      );

      switch (cryptoProvider) {
        case "quidax":
          return new QuidaxProvider();
        case "nowpayments":
          return new NowPaymentsProvider();
        default:
          logger.warn(
            `Unknown crypto provider '${cryptoProvider}', falling back to NowPayments`,
          );
          return new NowPaymentsProvider();
      }
    }

    // 2. Fiat Logic — Delegate to capability-driven GatewayRouter engine
    try {
      const GatewayRouter = require("./GatewayRouter");
      const { providerName, isNative, score } = GatewayRouter.selectBestGateway({
        currency: upCurrency,
        method,
        region,
      });

      logger.info(
        `[PaymentFactory] GatewayRouter selected '${providerName}' (score=${score}, native=${isNative}) for ${upCurrency} (${method})`
      );

      return this.getProviderByName(providerName);
    } catch (err) {
      logger.warn(
        `[PaymentFactory] GatewayRouter selection failed for ${upCurrency}/${method}: ${err.message}. Falling back to FincraProvider.`
      );
      return new FincraProvider();
    }
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
      case "flutterwave":
        return new FlutterwaveProvider();
      case "stripe":
        return new StripeProvider();
      case "zenith":
        return new ZenithProvider();
      case "moniepoint":
        return new MoniepointProvider();
      case "providus":
        return new ProvidusProvider();
      case "anchor":
        return new AnchorProvider();
      case "quidax":
        return new QuidaxProvider();

      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }
}

module.exports = PaymentFactory;
