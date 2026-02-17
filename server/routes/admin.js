const express = require("express");
const router = express.Router();
const path = require("path");
const adminController = require(
  path.join(__dirname, "..", "controllers", "adminController"),
);
const { requireAdmin } = require(
  path.join(__dirname, "..", "middleware", "auth"),
);

// All admin routes require admin authentication
router.use(requireAdmin);

// Dashboard
router.get("/stats", adminController.getStats);
router.get("/me", adminController.getAdminProfile);

// User Management
router.get("/users", adminController.getUsers);
router.put("/users/:id/status", adminController.updateUserStatus);
router.get("/users/:id/notes", adminController.getUserNotes);

// Support Chats
router.get("/support-chats", adminController.getSupportChats);
router.put("/support-chats/:id/status", adminController.updateChatStatus);
router.post("/support-chats/:id/join", adminController.joinSupportChat);

// Audit Logs
router.get("/audit-logs", adminController.getAuditLogs);

// Broadcasts
router.get("/broadcasts", adminController.getBroadcasts);
router.post("/broadcasts", adminController.createBroadcast);
router.delete("/broadcasts/:id", adminController.deleteBroadcast);

// Export
router.get("/support-chats/:id/export", adminController.exportChatTranscript);

// Auto-reply
router.get("/auto-reply", adminController.getAutoReplySettings);
router.put("/auto-reply", adminController.updateAutoReplySettings);

// System Settings
router.get("/settings", adminController.getSystemSettings);
router.put("/settings", adminController.updateSystemSettings);

// Monetization Management
router.get("/monetization/stats", adminController.getMonetizationStats);
router.get("/monetization/settings", adminController.getMonetizationSettings);
router.put(
  "/monetization/settings",
  adminController.updateMonetizationSettings,
);

// Affiliate Management
router.get("/affiliates/stats", adminController.getAffiliateStats);

module.exports = router;
