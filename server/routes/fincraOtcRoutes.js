/**
 * Fincra Manual OTC Crypto Conversion Routes
 * Endpoint base: /api/fincra/otc
 *
 * Security:
 *  - /initiate, /quote, /execute, /status require user authentication (requireAuth).
 *  - /pending, /confirm-funding require administrator authorization (requireAdmin).
 */

'use strict';

const express = require("express");
const router  = express.Router();
const { requireAuth, requireAdmin, requireOtcOperatorPermission } = require("../middleware/authMiddleware");
const fincraOtcFundingService = require("../services/fincra/fincraOtcFundingService");
const supabase = require("../config/database");
const logger   = require("../utils/logger");

/**
 * POST /api/fincra/otc/initiate
 * Initiate a USDT/USDC -> NGN manual OTC conversion request & reserve crypto.
 */
router.post("/initiate", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceAsset, destinationCurrency = "NGN", amount, idempotencyKey } = req.body;

    const result = await fincraOtcFundingService.initiateOtcConversion({
      userId,
      sourceAsset,
      destinationCurrency,
      amount,
      idempotencyKey,
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error(`[FincraOtcRoutes] /initiate error: ${err.message}`);
    const statusCode = err.message.includes("INSUFFICIENT_FUNDS") || err.message.includes("UNSUPPORTED_CONVERSION_PAIR") ? 400 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
});

/**
 * GET /api/fincra/otc/pending
 * Admin only: List all pending manual OTC funding requests.
 */
router.get("/pending", requireAdmin, async (req, res) => {
  try {
    const { data: pendingTxs, error } = await supabase
      .from("fincra_transactions")
      .select("id, reference, user_id, type, currency, source_asset, destination_currency, amount, reserved_crypto_amount, status, created_at")
      .eq("status", "OTC_FUNDING_PENDING")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      pendingCount: pendingTxs?.length || 0,
      requests: pendingTxs || [],
    });
  } catch (err) {
    logger.error(`[FincraOtcRoutes] GET /pending error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fincra/otc/confirm-funding
 * Admin only: Confirm Fincra balance receipt for an OTC deposit request.
 */
router.post("/confirm-funding", requireAdmin, requireOtcOperatorPermission, async (req, res) => {
  try {
    const operatorId = req.user.id;
    const { transactionReference, otcReference, externalReference, notes, evidenceReference } = req.body;

    if (!transactionReference || !otcReference) {
      return res.status(400).json({ error: "transactionReference and otcReference are required." });
    }

    const result = await fincraOtcFundingService.confirmOtcFunding({
      transactionReference,
      operatorId,
      otcReference,
      externalReference,
      notes,
      evidenceReference,
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error(`[FincraOtcRoutes] /confirm-funding error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/fincra/otc/quote
 * Request Fincra FX quote for an OTC confirmed conversion.
 */
router.post("/quote", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { transactionReference } = req.body;

    if (!transactionReference) {
      return res.status(400).json({ error: "transactionReference is required." });
    }

    const result = await fincraOtcFundingService.requestConversionQuote({
      transactionReference,
      userId,
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error(`[FincraOtcRoutes] /quote error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/fincra/otc/execute
 * Execute Fincra FX conversion using confirmed quote.
 */
router.post("/execute", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { transactionReference, quoteReference } = req.body;

    if (!transactionReference) {
      return res.status(400).json({ error: "transactionReference is required." });
    }

    const result = await fincraOtcFundingService.executeConversion({
      transactionReference,
      userId,
      quoteReference,
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error(`[FincraOtcRoutes] /execute error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/fincra/otc/status/:reference
 * User query: Status check for OTC conversion lifecycle.
 */
router.get("/status/:reference", requireAuth, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    const { data: tx, error } = await supabase
      .from("fincra_transactions")
      .select("*")
      .or(`reference.eq.${reference},fincra_reference.eq.${reference}`)
      .single();

    if (error || !tx) {
      return res.status(404).json({ error: "Conversion transaction not found." });
    }

    if (tx.user_id !== userId && !["admin", "support"].includes(req.userProfile?.role)) {
      return res.status(403).json({ error: "Unauthorized access to transaction status." });
    }

    // User-friendly state labels
    const statusLabels = {
      OTC_FUNDING_PENDING:      "Crypto Reserved — Awaiting Fincra OTC Funding",
      FINCRA_BALANCE_CONFIRMED: "Fincra Balance Confirmed — Quote Available",
      QUOTE_REQUESTED:          "Quote Requested",
      QUOTE_RECEIVED:           "Quote Received — Ready for Execution",
      CONVERSION_SUBMITTED:     "Conversion Submitted to Fincra",
      CONVERSION_PROCESSING:    "Conversion Processing",
      CONVERSION_SUCCESSFUL:    "Conversion Successful",
      NGN_SETTLED:              "NGN Settled to Wallet",
      CONVERSION_FAILED:        "Conversion Failed — Crypto Reservation Released",
      FUNDING_FAILED:           "OTC Funding Failed",
      RECONCILIATION_REQUIRED:  "Reconciliation Required",
    };

    return res.status(200).json({
      success: true,
      reference: tx.reference,
      fincraReference: tx.fincra_reference,
      status: tx.status,
      displayStatus: statusLabels[tx.status] || tx.status,
      sourceAsset: tx.source_asset || tx.currency,
      destinationCurrency: tx.destination_currency || "NGN",
      amount: tx.amount,
      otcReference: tx.otc_reference,
      quoteReference: tx.quote_reference,
      createdAt: tx.created_at,
      updatedAt: tx.updated_at,
    });
  } catch (err) {
    logger.error(`[FincraOtcRoutes] GET /status error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
