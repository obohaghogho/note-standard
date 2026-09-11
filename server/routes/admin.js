const express = require("express");
const router = express.Router();
const path = require("path");
const adminController = require(
  path.join(__dirname, "..", "controllers", "adminController"),
);
const reconciliationController = require(
  path.join(__dirname, "..", "controllers", "reconciliationController"),
);

const { requireAdmin } = require(
  path.join(__dirname, "..", "middleware", "auth"),
);

// All admin routes require admin authentication
router.use(requireAdmin);

// Dashboard & Analytics
router.get("/stats", adminController.getStats);
router.get("/analytics/detailed", adminController.getStats);
router.get("/me", adminController.getAdminProfile);

// Push Health & Communication Subsystem Health Dashboard
const {
  getPushHealth,
  getMessagingMetrics,
  sendTestPush,
  getMessageInspectorTrace,
  getConversationInspectorTrace,
  replayMessageDiagnosticAction
} = require(path.join(__dirname, '..', 'controllers', 'pushHealthController'));

router.get("/push-health", getPushHealth);
router.get("/messaging-metrics", getMessagingMetrics);
router.get("/communication-health", adminController.getCommunicationHealth);
router.get("/message-inspector/:messageId", getMessageInspectorTrace);
router.get("/conversation-inspector/:conversationId", getConversationInspectorTrace);
router.post("/message-inspector/:messageId/replay", replayMessageDiagnosticAction);
router.post("/push-health/test-push/:userId", sendTestPush);

// User Management
router.get("/users", adminController.getUsers);
router.put("/users/:id/status", adminController.updateUserStatus);
router.put("/users/:id/limit", adminController.updateUserLimit);
router.get("/users/:id/notes", adminController.getUserNotes);

// Limit Increase Requests
router.get("/limit-requests", adminController.getLimitRequests);
router.put("/limit-requests/:id", adminController.updateLimitRequest);

// Support Chats & Telemetry
router.get("/support-chats", adminController.getSupportChats);
router.get("/support-metrics", adminController.getSupportMetrics);
router.put("/support-chats/:id/status", adminController.updateChatStatus);
router.post("/support-chats/:id/join", adminController.joinSupportChat);

// Audit Logs
router.get("/audit-logs", adminController.getAuditLogs);
router.get("/payment-audit-logs", adminController.getPaymentAuditLogs);
router.get("/calls", adminController.getCallSessions);

// Institutional Reconciliation & Observability (Phase 7)
router.get("/reconciliation/proposals", reconciliationController.getProposals);
router.post("/reconciliation/proposals/:id/invalidate", reconciliationController.invalidateProposal);
router.post("/reconciliation/proposals/:id/approve", reconciliationController.approveHighDriftProposal);
router.get("/financial-stats", adminController.getFinancialStats);
router.get("/financial-overview", adminController.getFinancialOverview);
router.get("/settlement/overview", adminController.getSettlementOverview);
router.post("/settlements/sweep", adminController.sweepSettlements);

// Bank Payment & NGN Deposit Reconciliation Management
router.get("/unmatched-payments", adminController.getUnmatchedPayments);
router.post("/resolve-unmatched", adminController.resolveUnmatchedPayment);
router.get("/reconciliation/unmatched-deposits", adminController.getUnmatchedDeposits);
router.post("/reconciliation/reconcile-deposit", adminController.reconcileDeposit);

// Broadcasts
router.get("/broadcasts", adminController.getBroadcasts);
router.post("/broadcasts", adminController.createBroadcast);
router.delete("/broadcasts/:id", adminController.deleteBroadcast);

// Export
router.get("/support-chats/:id/export", adminController.exportChatTranscript);

// Auto-reply
router.get("/auto-reply", adminController.getAutoReplySettings);
router.put("/auto-reply", adminController.updateAutoReplySettings);

// System Settings & Governance
router.get("/settings", adminController.getSystemSettings);
router.put("/settings", adminController.updateSystemSettings);
router.post("/system/state", adminController.updateSystemState);
router.get("/system/status", adminController.getSystemStatus);

// ── Deposit Auto-Credit Settings (Admin-configurable limit gate) ──────────────
// GET  /api/admin/deposit-settings  → retrieve current auto-credit limit config
// PUT  /api/admin/deposit-settings  → update limit per currency, enable/disable
router.get("/deposit-settings", async (req, res) => {
  try {
    const supabase = require("../config/database");
    const { data, error } = await supabase
      .from("admin_settings")
      .select("value, updated_at")
      .eq("key", "deposit_auto_credit_config")
      .maybeSingle();

    if (error) throw error;
    res.json(data || {
      value: {
        enabled: true,
        limit_ngn: 50000,
        limit_usd: 50,
        limit_eur: 50,
        limit_gbp: 40,
        require_proof: true,
        notify_admin_on_high: true,
      },
      updated_at: null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/deposit-settings", async (req, res) => {
  try {
    const supabase = require("../config/database");
    const { enabled, limit_ngn, limit_usd, limit_eur, limit_gbp, require_proof, notify_admin_on_high } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "'enabled' (boolean) is required" });
    }

    const newConfig = {
      enabled,
      limit_ngn:             parseFloat(limit_ngn)  || 50000,
      limit_usd:             parseFloat(limit_usd)  || 50,
      limit_eur:             parseFloat(limit_eur)  || 50,
      limit_gbp:             parseFloat(limit_gbp)  || 40,
      require_proof:         require_proof !== false,
      notify_admin_on_high:  notify_admin_on_high !== false,
      description:           "Deposits at or below the limit are auto-credited. Above the limit requires admin approval.",
    };

    const { error } = await supabase
      .from("admin_settings")
      .upsert({
        key:        "deposit_auto_credit_config",
        value:      newConfig,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

    if (error) throw error;

    const logger = require("../utils/logger");
    logger.info(`[Admin] Deposit auto-credit settings updated by ${req.user.id}:`, newConfig);

    res.json({ message: "Deposit auto-credit settings updated successfully", config: newConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Deposit Queue — pending_admin_review high-value deposits ─────────────────
router.get("/deposit-queue", async (req, res) => {
  try {
    const manualDepositController = require("../controllers/deposit/manualDepositController");
    req.query.status = req.query.status || "pending_admin_review";
    return manualDepositController.getPendingDeposits(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monetization Management
router.get("/monetization/stats", adminController.getMonetizationStats);
router.get("/monetization/settings", adminController.getMonetizationSettings);
router.put(
  "/monetization/settings",
  adminController.updateMonetizationSettings,
);

// Affiliate Management
router.get("/affiliates/stats", adminController.getAffiliateStats);

// Debugging / Testing Mode Tools
router.post("/debug/force-confirm", adminController.debugForceConfirm);
router.post("/debug/simulate-swap", adminController.debugSimulateSwap);
router.post("/debug/simulate-webhook", adminController.debugSimulateWebhook);

// Manual Withdrawals & Universal Reconciliation Queue
router.get("/withdrawals/pending", adminController.getPendingWithdrawals);
router.put("/withdrawals/:id/approve", adminController.approveWithdrawal);
router.put("/withdrawals/:id/reject", adminController.rejectWithdrawal);
router.get("/reconciliation/unmatched-withdrawals", adminController.getUnmatchedWithdrawals);
router.post("/reconciliation/reconcile-withdrawal", adminController.reconcileWithdrawal);

// Fincra Admin Sub-Router (isolated, feature-flagged internally)
if (process.env.ENABLE_FINCRA === "true") {
  router.use("/fincra", require("./admin/fincraAdmin"));
}

// Enterprise Treasury Dashboard
router.use('/treasury', require('./admin/treasuryRoutes'));

// Reporting & Maintenance Mode
router.use('/reports', require('./admin/reportingRoutes'));

// Enterprise Payment Capabilities Registry & Rails Engine
router.get('/payment-capabilities', async (req, res) => {
  try {
    const ProviderCapabilityRegistry = require('../services/payment/ProviderCapabilityRegistry');
    const grid = await ProviderCapabilityRegistry.getAdminCapabilitiesGrid();
    res.json(grid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payment-capabilities/refresh', async (req, res) => {
  try {
    const ProviderCapabilityRegistry = require('../services/payment/ProviderCapabilityRegistry');
    const updated = await ProviderCapabilityRegistry.refreshCapabilities();
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
