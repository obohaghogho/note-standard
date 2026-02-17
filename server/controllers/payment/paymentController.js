const paymentService = require("../../services/payment/paymentService");

/**
 * Initialize Payment
 * POST /api/payment/initialize
 */
exports.initialize = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.user;
    const { amount, currency, metadata, options } = req.body;

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
