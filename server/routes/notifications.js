const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getNotifications, markAsRead, markAllAsRead, subscribeToNotifications } = require('../controllers/notificationController');

router.use(requireAuth);

router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);
router.post('/subscribe', subscribeToNotifications);

module.exports = router;
