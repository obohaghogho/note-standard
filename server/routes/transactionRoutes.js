const express = require("express");
const router = express.Router();
const supabase = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const logger = require("../utils/logger");

// In-memory rate limiter — max 1 Paystack verify call per 15s per reference.
// Prevents rate-limit exhaustion when the frontend polls rapidly.
const _lastVerifyAttempt = new Map(); // reference -> timestamp

/**
 * GET /api/transactions/status/:reference
 * Pure O(1) DB read. Fast path — no external provider calls.
 * Returns the current DB-persisted status immediately.
 */
router.get("/status/:reference", requireAuth, async (req, res) => {
  const { reference } = req.params;
  const userId = req.user.id;

  try {
    const { data: tx, error } = await supabase
      .from("transactions")
      .select("id, status, amount, currency, reference_id, user_id")
      .or(`reference_id.eq.${reference},provider_reference.eq.${reference}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !tx) {
      logger.warn(`[TransactionStatus] Not found: ${reference}`);
      return res.status(200).json({ 
        success: true, 
        data: { status: "NOT_FOUND" } 
      });
    }

    if (tx.user_id !== userId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    return res.json({
      success: true,
      data: {
        status: (tx.status || "PENDING").toUpperCase(),
        amount: parseFloat(tx.amount || 0),
        currency: tx.currency,
        reference: tx.reference_id
      }
    });

  } catch (err) {
    logger.error(`[TransactionStatus] Internal Error for ${reference}:`, err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/transactions/verify/:reference
 * Explicit proactive verification — calls Paystack API directly and credits wallet.
 * Rate-limited to once per 15s per reference to prevent provider rate limits.
 * Called by the frontend every ~20s and on manual "Verify" user action.
 */
router.post("/verify/:reference", requireAuth, async (req, res) => {
  const { reference } = req.params;
  const userId = req.user.id;

  try {
    // ── Rate Gate ─────────────────────────────────────────────────
    const now = Date.now();
    const RATE_LIMIT_MS = 15000;
    const lastAttempt = _lastVerifyAttempt.get(reference);

    if (lastAttempt && (now - lastAttempt) < RATE_LIMIT_MS) {
      const { data: tx } = await supabase
        .from("transactions")
        .select("status, amount, currency, reference_id, user_id")
        .or(`reference_id.eq.${reference},provider_reference.eq.${reference}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tx) return res.status(404).json({ success: false, error: "Transaction not found" });
      if (tx.user_id !== userId) return res.status(403).json({ success: false, error: "Forbidden" });

      return res.json({
        success: true,
        data: {
          status: (tx.status || "PENDING").toUpperCase(),
          amount: parseFloat(tx.amount || 0),
          currency: tx.currency,
          reference: tx.reference_id,
          rateLimited: true,
          retryAfterMs: RATE_LIMIT_MS - (now - lastAttempt)
        }
      });
    }

    _lastVerifyAttempt.set(reference, now);
    // Clean up stale entries
    if (_lastVerifyAttempt.size > 500) {
      const cutoff = now - 600000;
      for (const [ref, ts] of _lastVerifyAttempt.entries()) {
        if (ts < cutoff) _lastVerifyAttempt.delete(ref);
      }
    }

    // ── Fetch transaction with ALL required fields ────────────────
    const { data: tx } = await supabase
      .from("transactions")
      .select("id, status, amount, currency, reference_id, provider, user_id, provider_reference")
      .or(`reference_id.eq.${reference},provider_reference.eq.${reference}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tx) return res.status(404).json({ success: false, error: "Transaction not found" });
    if (tx.user_id !== userId) return res.status(403).json({ success: false, error: "Forbidden" });

    // Already finalized — return immediately, no Paystack call needed
    const dbStatus = (tx.status || "PENDING").toUpperCase();
    if (["COMPLETED", "SUCCESS"].includes(dbStatus)) {
      return res.json({
        success: true,
        data: { status: dbStatus, amount: parseFloat(tx.amount || 0), currency: tx.currency, reference: tx.reference_id }
      });
    }

    // ── Call Paystack verify API directly ─────────────────────────
    logger.info(`[VerifyRoute] Calling Paystack verify for ${reference}`);

    const PaystackProvider = require("../services/payment/providers/PaystackProvider");
    const paystackProvider = new PaystackProvider();
    const verifyResult = await paystackProvider.verifyPayment(tx.reference_id || reference);

    logger.info(`[VerifyRoute] Paystack returned: ${verifyResult.status} for ${reference}`);

    if (verifyResult.status === "success") {
      // Credit wallet via safe idempotent helper
      const FiatWalletService = require("../services/FiatWalletService");
      const AuditLogService   = require("../services/AuditLogService");
      const idempotencyKey = `paystack_verify_${tx.reference_id}_${tx.id}`;

      try {
        const ledgerTxId = await FiatWalletService.fundWallet(
          tx.user_id,
          tx.currency,
          tx.amount,
          idempotencyKey,
          { provider: "paystack", reference: tx.reference_id, manual_verify: true }
        );

        await supabase
          .from("transactions")
          .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
          .eq("id", tx.id);

        AuditLogService.log({
          user_id:   tx.user_id,
          action:    "fiat_deposit_manual_verify",
          provider:  "paystack",
          reference: tx.reference_id,
          amount:    tx.amount,
          currency:  tx.currency,
          ledger_id: ledgerTxId
        }).catch(err => logger.warn("[VerifyRoute] Audit log failed:", err.message));

        logger.info(`[VerifyRoute] Successfully credited wallet for ${reference}`);
        return res.json({
          success: true,
          data: { status: "COMPLETED", amount: parseFloat(tx.amount || 0), currency: tx.currency, reference: tx.reference_id }
        });
      } catch (creditErr) {
        // If fundWallet throws because already credited (idempotency), return COMPLETED
        if (creditErr.message?.includes("idempotency") || creditErr.message?.includes("already")) {
          return res.json({
            success: true,
            data: { status: "COMPLETED", amount: parseFloat(tx.amount || 0), currency: tx.currency, reference: tx.reference_id }
          });
        }
        logger.error(`[VerifyRoute] Credit failed for ${reference}:`, creditErr.message);
        throw creditErr;
      }
    }

    // Payment not yet successful on Paystack's side — return current status
    return res.json({
      success: true,
      data: {
        status: dbStatus,
        amount: parseFloat(tx.amount || 0),
        currency: tx.currency,
        reference: tx.reference_id,
        paystackStatus: verifyResult.status  // 'abandoned', 'pending', etc.
      }
    });

  } catch (err) {
    logger.error(`[VerifyRoute] Error for ${reference}:`, err.message);
    return res.status(500).json({ success: false, error: "Verification failed", details: err.message });
  }
});

module.exports = router;
