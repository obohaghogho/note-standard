const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
  deleteNotification,
  deleteAllNotifications,
  notifyLogin,
} = require("../controllers/notificationController");

router.use(requireAuth);

router.get("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);
router.post("/subscribe", subscribeToNotifications);
router.post("/login-notify", notifyLogin);
router.delete("/:id", deleteNotification);
router.delete("/", deleteAllNotifications);

module.exports = router;
