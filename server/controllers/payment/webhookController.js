const PaymentFactory = require("../../services/payment/PaymentFactory");
const logger = require("../../utils/logger");

/**
 * Unified Webhook Controller
 * Directly routes HTTP req/res to provider implementations
 * to enforce idempotency, try/catch, and HTTP 200 stability rules.
 */
exports.handlePaystack = async (req, res) => {
  const provider = PaymentFactory.getProviderByName("paystack");
  return provider.processWebhook(req, res);
};

exports.handleFlutterwave = async (req, res) => {
  const provider = PaymentFactory.getProviderByName("flutterwave");
  return provider.processWebhook(req, res);
};

exports.handleKorapay = async (req, res) => {
  const provider = PaymentFactory.getProviderByName("korapay");
  return provider.processWebhook(req, res);
};

exports.handleCrypto = async (req, res) => {
  const providerName = process.env.CRYPTO_PROVIDER || "crypto";
  const provider = PaymentFactory.getProviderByName(providerName);
  return provider.processWebhook(req, res);
};

exports.handleNowPayments = async (req, res) => {
  const provider = PaymentFactory.getProviderByName("nowpayments");
  return provider.processWebhook(req, res);
};
