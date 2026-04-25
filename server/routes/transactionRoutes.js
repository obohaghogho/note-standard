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
 * Explicit proactive verification — calls Paystack directly.
 * Rate-limited to once per 15s per reference to prevent provider rate limits.
 * Called by the frontend every ~20s (not every poll) and on manual user action.
 */
router.post("/verify/:reference", async (req, res) => {
  const { reference } = req.params;
  const userId = req.user ? req.user.id : null;

  try {
    // ── Rate Gate ─────────────────────────────────────────────────
    const now = Date.now();
    const RATE_LIMIT_MS = 15000; // 15 seconds between Paystack calls per reference
    const lastAttempt = _lastVerifyAttempt.get(reference);

    if (lastAttempt && (now - lastAttempt) < RATE_LIMIT_MS) {
      // Too soon — return current DB status without calling Paystack
      const { data: tx } = await supabase
        .from("transactions")
        .select("status, amount, currency, reference_id, user_id")
        .or(`reference_id.eq.${reference},provider_reference.eq.${reference}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tx) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }

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
    // Clean up stale entries older than 10 minutes
    if (_lastVerifyAttempt.size > 500) {
      const cutoff = now - 600000;
      for (const [ref, ts] of _lastVerifyAttempt.entries()) {
        if (ts < cutoff) _lastVerifyAttempt.delete(ref);
      }
    }

    // ── Security: verify ownership before calling Paystack ────────
    const { data: tx } = await supabase
      .from("transactions")
      .select("id, status, amount, currency, reference_id, provider, user_id, provider_reference")
      .or(`reference_id.eq.${reference},provider_reference.eq.${reference}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tx) {
      return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    // Already finalized — no need to call Paystack
    const dbStatus = (tx.status || "PENDING").toUpperCase();
    if (["COMPLETED", "SUCCESS", "FAILED", "CANCELLED"].includes(dbStatus)) {
      return res.json({
        success: true,
        data: {
          status: dbStatus,
          amount: parseFloat(tx.amount || 0),
          currency: tx.currency,
          reference: tx.reference_id
        }
      });
    }

    // ── Call Paystack ─────────────────────────────────────────────
    logger.info(`[VerifyRoute] Calling provider.verify for ${reference} (provider: ${tx.provider})`);

    const paymentService = require("../services/payment/paymentService");
    const verified = await paymentService.verifyPaymentStatus(
      tx.reference_id || reference,
      tx.provider_reference || null
    );

    const resolvedStatus = (verified?.status || dbStatus).toUpperCase();
    logger.info(`[VerifyRoute] Result for ${reference}: ${resolvedStatus}`);

    return res.json({
      success: true,
      data: {
        status: resolvedStatus,
        amount: parseFloat(verified?.amount ?? tx.amount ?? 0),
        currency: verified?.currency || tx.currency,
        reference: tx.reference_id
      }
    });

  } catch (err) {
    logger.error(`[VerifyRoute] Error for ${reference}:`, err.message);
    return res.status(500).json({ success: false, error: "Verification failed", details: err.message });
  }
});

module.exports = router;
