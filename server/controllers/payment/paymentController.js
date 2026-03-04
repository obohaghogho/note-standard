const paymentService = require("../../services/payment/paymentService");

/**
 * Initialize Payment
 * POST /api/payment/initialize
 */
exports.initialize = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.user;
    const { amount, currency, network, metadata, options } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: "Amount and currency are required",
      });
    }

    const result = await paymentService.initializePayment(
      userId,
      email,
      amount,
      currency,
      network || "native",
      metadata || {},
      options || {},
    );

    res.json(result);
  } catch (error) {
    console.error("[PaymentController] Init Error:", error);
    res.status(500).json({
      error: error.message || "Payment initialization failed",
    });
  }
};

/**
 * Check Transaction Status
 * GET /api/payment/status/:reference
 */
exports.checkStatus = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    // Proactively verify status with provider
    const tx = await paymentService.verifyPaymentStatus(reference);

    if (!tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Security check
    if (tx.user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json({
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      provider: tx.provider,
    });
  } catch (error) {
    console.error("[PaymentController] Status Check Error:", error);
    res.status(500).json({ error: "Status check failed" });
  }
};

/**
 * Direct Verify Payment
 * POST /api/verify-payment
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { transaction_id } = req.body;
    const userId = req.user.id;

    if (!transaction_id) {
      return res.status(400).json({ error: "transaction_id is required" });
    }

    // 1. We use a placeholder reference because verifyPaymentStatus will use externalId (transaction_id)
    // to fetch the real tx_ref from provider if needed.
    // However, to find the record in our DB first, we either need reference_id or provider_reference.
    // If we only have transaction_id, we should look it up first or allow verifyPaymentStatus to handle it.

    // Let's refine verifyPaymentStatus to find by provider_reference too.
    const tx = await paymentService.verifyPaymentStatus(null, transaction_id);

    if (!tx) {
      return res.status(404).json({
        error: "Transaction not found or could not be verified",
      });
    }

    if (tx.user_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json({
      success: tx.status === "COMPLETED",
      status: tx.status,
      transaction: tx,
    });
  } catch (error) {
    console.error("[PaymentController] Verify Payment Error:", error);
    res.status(500).json({ error: error.message || "Verification failed" });
  }
};
