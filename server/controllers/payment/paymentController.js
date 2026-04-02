const paymentService = require("../../services/payment/paymentService");
const supabase = require("../../config/database");
const logger = require("../../utils/logger");

/**
 * Payment Controller
 *
 * Handles all payment-related HTTP endpoints:
 * - Initialize (Paystack or Grey)
 * - Verify Paystack (post-checkout confirmation)
 * - Verify Grey (poll for email-parsed confirmation)
 * - Status check
 * - Manual payment instructions
 * - Admin manual confirm
 */

/**
 * Initialize Payment
 * POST /api/payment/initialize
 *
 * Accepts: { amount, currency, provider?, metadata?, options? }
 * Returns:
 *   For Paystack: { url, reference, provider: "paystack" }
 *   For Grey:     { instructions, reference, expiresAt, provider: "grey" }
 */
exports.initialize = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.user;
    const {
      amount,
      currency,
      network,
      metadata,
      options,
      provider: requestedProvider,
    } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: "Amount and currency are required",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: "Amount must be positive" });
    }

    const result = await paymentService.initializePayment(
      userId,
      email,
      amount,
      currency,
      { ...metadata, network: network || "native" },
      { ...(options || {}), provider: requestedProvider }
    );

    res.json(result);
  } catch (error) {
    logger.error("[PaymentController] Init Error:", error.message);
    res.status(500).json({
      error: error.message || "Payment initialization failed",
    });
  }
};

/**
 * Verify Paystack Payment
 * POST /api/payment/verify-paystack
 *
 * Called by frontend after Paystack checkout redirect.
 * Verifies the transaction with Paystack API and finalizes if successful.
 *
 * Accepts: { reference }
 * Returns: { success, status, transaction }
 */
exports.verifyPaystack = async (req, res) => {
  try {
    const { reference } = req.body;
    const userId = req.user.id;

    if (!reference) {
      return res.status(400).json({ error: "Reference is required" });
    }

    // Verify with Paystack API and finalize
    const tx = await paymentService.verifyPaymentStatus(reference);

    if (!tx) {
      return res.status(404).json({
        error: "Transaction not found or could not be verified",
      });
    }

    // Security: ensure this transaction belongs to the requesting user
    if (tx.user_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json({
      success: tx.status === "COMPLETED",
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      provider: tx.provider,
    });
  } catch (error) {
    logger.error("[PaymentController] Verify Paystack Error:", error.message);
    res.status(500).json({ error: error.message || "Verification failed" });
  }
};

/**
 * Verify Grey Payment
 * POST /api/payment/verify-grey
 *
 * Frontend polls this endpoint to check if a Grey bank transfer
 * has been detected and matched via Brevo email parsing.
 *
 * Accepts: { reference }
 * Returns: { success, status, amount, currency, expiresAt }
 */
exports.verifyGrey = async (req, res) => {
  try {
    const { reference } = req.body;
    const userId = req.user.id;

    if (!reference) {
      return res.status(400).json({ error: "Reference is required" });
    }

    // Check the payments table for Grey payment status
    const { data: payment, error } = await supabase
      .from("payments")
      .select(
        "status, amount, currency, credited, metadata, expires_at, sender_name, user_id"
      )
      .or(
        `reference.eq.${reference},metadata->>user_reference.eq.${reference}`
      )
      .maybeSingle();

    if (error || !payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Security check
    if (payment.user_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check if expired
    let status = payment.status;
    if (
      status === "pending" &&
      payment.expires_at &&
      new Date(payment.expires_at) < new Date()
    ) {
      status = "expired";
    }

    res.json({
      success: status === "success",
      status,
      amount: payment.amount,
      currency: payment.currency,
      credited: payment.credited,
      senderName: payment.sender_name,
      expiresAt: payment.expires_at,
    });
  } catch (error) {
    logger.error("[PaymentController] Verify Grey Error:", error.message);
    res.status(500).json({ error: error.message || "Verification failed" });
  }
};

/**
 * Check Transaction Status
 * GET /api/payment/status/:reference
 *
 * Generic status check that works for any provider.
 * Proactively verifies with provider if still pending.
 */
exports.checkStatus = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

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
    logger.error("[PaymentController] Status Check Error:", error.message);
    res.status(500).json({ error: "Status check failed" });
  }
};

/**
 * Direct Verify Payment
 * POST /api/verify-payment
 *
 * Legacy endpoint for verifying by transaction_id.
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { transaction_id } = req.body;
    const userId = req.user.id;

    if (!transaction_id) {
      return res.status(400).json({ error: "transaction_id is required" });
    }

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
    logger.error("[PaymentController] Verify Payment Error:", error.message);
    res.status(500).json({ error: error.message || "Verification failed" });
  }
};

/**
 * Get Manual Payment Instructions
 * GET /api/payment/instructions/:currency
 *
 * Returns Grey bank account details for the requested currency.
 */
exports.getInstructions = async (req, res) => {
  try {
    const { currency } = req.params;
    const upCurrency = String(currency).toUpperCase();

    const { data: instructions, error } = await supabase
      .from("grey_instructions")
      .select("*")
      .eq("currency", upCurrency)
      .maybeSingle();

    if (error || !instructions) {
      return res
        .status(404)
        .json({ error: `No instructions found for ${upCurrency}` });
    }

    res.json(instructions);
  } catch (error) {
    logger.error("[PaymentController] Instructions Error:", error.message);
    res.status(500).json({ error: "Failed to fetch instructions" });
  }
};

/**
 * Admin Manual Confirm Payment
 * POST /api/payment/manual-confirm
 *
 * Allows admins to manually confirm a Grey payment when auto-parsing fails.
 * Creates an audit trail entry.
 */
exports.manualConfirm = async (req, res) => {
  try {
    const { reference, amount, currency, senderName, reason } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "Reference is required" });
    }

    // Record audit log
    try {
      await supabase.from("payment_audit_logs").insert({
        admin_id: req.user.id,
        payment_reference: reference,
        action: "MANUAL_CONFIRM",
        previous_status: "pending",
        new_status: "success",
        reason: reason || "Admin manual confirmation",
        metadata: {
          amount,
          currency,
          senderName,
          ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        },
      });
    } catch (auditErr) {
      logger.warn("[PaymentController] Audit log insert failed:", auditErr.message);
    }

    // Update sender name if provided
    if (senderName) {
      await supabase
        .from("payments")
        .update({ sender_name: senderName })
        .eq("reference", reference)
        .catch(() => {});
    }

    // Execute the payment finalization
    const event = {
      type: "deposit",
      reference,
      status: "success",
      amount,
      currency,
      sender: senderName,
      raw: { source: "admin_manual_confirm", ...req.body },
    };

    const result = await paymentService.executeWebhookAction(
      event,
      req.body,
      "grey"
    );

    res.json({ success: true, result });
  } catch (error) {
    logger.error("[PaymentController] Manual Confirm Error:", error.message);
    res
      .status(500)
      .json({ error: error.message || "Manual confirmation failed" });
  }
};
