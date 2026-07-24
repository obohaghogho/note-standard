/**
 * Fincra Admin API Routes
 * Endpoint prefix: /api/admin/fincra/*
 *
 * All endpoints require admin role.
 * NEW FILE — no modifications to existing admin routes.
 */

const express   = require("express");
const router    = express.Router();
const supabase  = require("../../config/database");
const { requireAuth, requireAdmin } = require("../../middleware/authMiddleware");
const logger    = require("../../utils/logger");

// All Fincra admin routes require authentication + admin role
router.use(requireAuth, requireAdmin);

// Feature flag guard
router.use((req, res, next) => {
  if (process.env.ENABLE_FINCRA !== "true") {
    return res.status(404).json({ success: false, error: "Fincra integration is not enabled." });
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/fincra/webhook-logs
// Returns the 200 most recent Fincra webhook log entries.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/webhook-logs", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const { data: logs, error } = await supabase
      .from("fincra_webhook_logs")
      .select("id, event_type, signature_verified, processed, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    res.json({ success: true, logs: logs || [] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/fincra/audit-logs
// Returns the 200 most recent Fincra audit log entries.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/audit-logs", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const { data: logs, error } = await supabase
      .from("fincra_audit_logs")
      .select("id, action, user_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    res.json({ success: true, logs: logs || [] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/fincra/transactions
// Returns all Fincra transactions (admin view with user IDs).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions", async (req, res, next) => {
  try {
    const limit  = parseInt(req.query.limit) || 100;
    const status = req.query.status;

    let query = supabase
      .from("fincra_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    res.json({ success: true, transactions: data || [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
