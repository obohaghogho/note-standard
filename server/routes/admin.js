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
router.post("/settlements/sweep", adminController.sweepSettlements);


// Bank Payment Management
router.get("/unmatched-payments", adminController.getUnmatchedPayments);
router.post("/resolve-unmatched", adminController.resolveUnmatchedPayment);

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

// Manual Withdrawals
router.get("/withdrawals/pending", adminController.getPendingWithdrawals);
router.put("/withdrawals/:id/approve", adminController.approveWithdrawal);
router.put("/withdrawals/:id/reject", adminController.rejectWithdrawal);

// Fincra Admin Sub-Router (isolated, feature-flagged internally)
if (process.env.ENABLE_FINCRA === "true") {
  router.use("/fincra", require("./admin/fincraAdmin"));
}

module.exports = router;
