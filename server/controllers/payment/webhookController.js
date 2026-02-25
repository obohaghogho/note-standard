const paymentService = require("../../services/payment/paymentService");
const logger = require("../../utils/logger");

/**
 * Unified Webhook Controller
 * Handles incoming webhooks from all providers
 */
exports.handlePaystack = async (req, res) => {
  try {
    await paymentService.handleWebhook(
      "paystack",
      req.headers,
      req.body,
      req.rawBody,
    );
    res.json({ received: true });
  } catch (error) {
    console.error("[WebhookController] Paystack Error:", error.message);
    res.status(200).json({ received: true, error: error.message }); // Always 200 to acknowledge receipt unless it's a critical crash
  }
};

exports.handleFlutterwave = async (req, res) => {
  try {
    await paymentService.handleWebhook(
      "flutterwave",
      req.headers,
      req.body,
      req.rawBody,
    );
    res.json({ received: true });
  } catch (error) {
    console.error("[WebhookController] Flutterwave Error:", error.message);
    res.status(200).json({ received: true, error: error.message });
  }
};

exports.handleKorapay = async (req, res) => {
  try {
    await paymentService.handleWebhook(
      "korapay",
      req.headers,
      req.body,
      req.rawBody,
    );
    res.json({ received: true });
  } catch (error) {
    console.error("[WebhookController] Korapay Error:", error.message);
    res.status(200).json({ received: true, error: error.message });
  }
};

exports.handleCrypto = async (req, res) => {
  try {
    const provider = process.env.CRYPTO_PROVIDER || "crypto";
    await paymentService.handleWebhook(
      provider,
      req.headers,
      req.body,
      req.rawBody,
    );
    res.json({ received: true });
  } catch (error) {
    console.error("[WebhookController] Crypto Error:", error.message);
    res.status(200).json({ received: true, error: error.message });
  }
};

exports.handleNowPayments = async (req, res) => {
  const { headers, body } = req;
  const paymentId = body.payment_id;
  const orderId = body.order_id;

  try {
    logger.info("NowPayments Webhook Received", {
      paymentId,
      orderId,
      status: body.payment_status,
    });

    // 1. Verify Signature
    const isValid = await paymentService.verifyWebhookSignature(
      "nowpayments",
      headers,
      body,
      req.rawBody,
    );

    if (!isValid) {
      logger.warn("Suspicious Webhook Attempt (Unauthorized signature)", {
        paymentId,
        orderId,
        ip: req.ip,
      });
      return res.status(401).json({ error: "Invalid signature" });
    }

    // 2. Delegate to PaymentService for full audit logging and processing
    // The provider's parseWebhookEvent will correctly map only "finished" to success.
    const result = await paymentService.handleWebhook(
      "nowpayments",
      headers,
      body,
      req.rawBody,
    );

    res.json({ received: true, status: result?.status });
  } catch (error) {
    logger.error("NowPayments Webhook Error:", {
      message: error.message,
      orderId,
      paymentId,
    });
    // Still return 200 unless it's a code-level crash we want to debug,
    // to avoid infinite retry loops if we've already logged the error properly.
    res.status(200).json({ received: true, error: error.message });
  }
};
