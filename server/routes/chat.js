const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const translationController = require("../controllers/translationController");
const { requireAuth } = require("../middleware/auth");

// All chat routes require authentication
router.use(requireAuth);

// Translations
router.post("/translate", translationController.translateMessage);
router.post("/preference", translationController.updatePreferredLanguage);
router.post(
  "/report-translation",
  translationController.reportTranslationError,
);

// Conversations
router.get("/conversations", chatController.getConversations);
router.post("/conversations", chatController.createConversation);
router.post("/support", chatController.createSupportChat); // NEW: User creates support chat
router.put(
  "/conversations/:conversationId/accept",
  chatController.acceptConversation,
);
router.delete(
  "/conversations/:conversationId",
  chatController.deleteConversation,
);

// Messages
router.get(
  "/conversations/:conversationId/messages",
  chatController.getMessages,
);
router.get(
  "/conversations/:conversationId/search",
  chatController.searchMessages,
);
router.post(
  "/conversations/:conversationId/messages",
  chatController.sendMessage,
);
router.put("/messages/:messageId/read", chatController.markMessageRead);

module.exports = router;
