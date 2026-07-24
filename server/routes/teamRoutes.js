const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const { requireAuth } = require("../middleware/authMiddleware");

router.use(requireAuth);

router.get("/my-teams", teamController.getMyTeams);
router.get("/:teamId/messages", teamController.getTeamMessages);
router.post("/:teamId/messages", teamController.sendTeamMessage);
router.patch("/:teamId/messages/:messageId", teamController.editTeamMessage);
router.delete("/:teamId/messages/:messageId", teamController.deleteTeamMessage);

router.get("/:teamId/members", teamController.getTeamMembers);
router.post("/:teamId/members", teamController.inviteMember);
router.delete("/:teamId/members/:userId", teamController.removeMember);

// Enterprise Workspace Analytics
router.get("/:teamId/analytics", teamController.getAnalytics);

// Files Cabinet (FIXED ROUTE ORDER: /files/recycled MUST be before /files/:fileId)
router.get("/:teamId/files/recycled", teamController.getRecycledFiles);
router.get("/:teamId/files", teamController.getFiles);
router.post("/:teamId/files", teamController.uploadFile);
router.delete("/:teamId/files/:fileId", teamController.deleteFile);
router.post("/:teamId/files/:fileId/restore", teamController.restoreFile);

// Video Syncs
router.get("/:teamId/syncs", teamController.getSyncs);
router.post("/:teamId/syncs", teamController.createSync);
router.post("/:teamId/syncs/:syncId/join", teamController.joinSync);
router.delete("/:teamId/syncs/:syncId", teamController.deleteSync);

// Workspace Bulletins
router.get("/:teamId/bulletins", teamController.getBulletins);
router.post("/:teamId/bulletins", teamController.createBulletin);
router.post("/:teamId/bulletins/:bulletinId/read", teamController.markBulletinRead);
router.delete("/:teamId/bulletins/:bulletinId", teamController.deleteBulletin);

// Webhook Secret Generation
router.get("/:teamId/webhook-secret", teamController.getWebhookSecret);
router.post("/:teamId/webhook-secret/generate", teamController.generateWebhookSecret);

module.exports = router;
