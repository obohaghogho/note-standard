/**
 * Admin Operations & FinOps Routes (/api/v1/admin/withdrawals/*)
 * ─────────────────────────────────────────────────────────────
 * Exposes admin endpoints for manual review, webhook replay, DLQ management, and analytics.
 */

const express         = require("express");
const router          = express.Router();
const { requireAuth } = require("../../middleware/authMiddleware");
const supabase        = require("../../config/database");
const { getUnresolvedDLQEntries } = require("../../withdrawal/deadLetterQueue");
const logger          = require("../../utils/logger");

// Middleware guard: ensure user has admin role
async function requireAdmin(req, res, next) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin authorization required." });
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.use(requireAuth);
router.use(requireAdmin);

// ── GET /api/v1/admin/withdrawals/pending ────────────────────────────────────
router.get("/pending", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("fincra_transactions")
      .select("*, profile:profiles(email, full_name)")
      .eq("status", "MANUAL_REVIEW")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, pending: data || [] });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/v1/admin/withdrawals/:id/approve ────────────────────────────────
router.post("/:id/approve", async (req, res, next) => {
  try {
    const txId = req.params.id;
    const { adminNotes } = req.body;

    const { data: tx, error } = await supabase
      .from("fincra_transactions")
      .select("*")
      .eq("id", txId)
      .single();

    if (error || !tx) {
      return res.status(404).json({ success: false, error: "Transaction not found." });
    }

    const { registry } = require("../../providers/PayoutProvider");
    const provider = registry.getPrimary();

    const providerRes = await provider.initiatePayout({
      amount:        tx.amount,
      currency:      tx.currency,
      bankCode:      tx.bank_code,
      accountNumber: tx.metadata?.accountNumber || tx.account_number_masked,
      accountName:   tx.account_name,
      narration:     tx.narration,
      reference:     tx.reference,
    });

    await supabase
      .from("fincra_transactions")
      .update({
        status:           "PROCESSING",
        fincra_reference: providerRes.fincraReference,
        metadata:         { ...(tx.metadata || {}), approved_by: req.user.id, admin_notes: adminNotes },
      })
      .eq("id", txId);

    res.json({ success: true, message: "Transaction approved and submitted to provider." });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/v1/admin/webhooks/replay ──────────────────────────────────────
router.post("/webhooks/replay", async (req, res, next) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ success: false, error: "Transaction reference is required." });
    }

    const { registry } = require("../../providers/PayoutProvider");
    const provider = registry.getPrimary();
    const verifyRes = await provider.verifyPayout(reference);

    const extStatus = (verifyRes.status || "").toLowerCase();
    let finalStatus = "REVERSED";
    if (extStatus === "successful" || extStatus === "success") {
      finalStatus = "SUCCESSFUL";
    }

    const rpcRes = await supabase.rpc("finalize_enterprise_withdrawal", {
      p_withdrawal_ref: reference,
      p_fincra_ref:     verifyRes.rawResponse?.data?.reference || null,
      p_status:         finalStatus,
      p_error_code:     finalStatus === "REVERSED" ? "REPLAY_MANUAL_REVERSAL" : null,
    });

    res.json({ success: true, message: "Webhook replayed successfully", status: finalStatus, result: rpcRes });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/admin/withdrawals/dlq ────────────────────────────────────────
router.get("/dlq", async (req, res, next) => {
  try {
    const dlq = await getUnresolvedDLQEntries();
    res.json({ success: true, dlq });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
