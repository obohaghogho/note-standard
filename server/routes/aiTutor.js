const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const aiTutorController = require('../controllers/aiTutorController');

// All AI Tutor routes require authentication
router.use(requireAuth);

// POST /api/ai-tutor/chat
// Body: { spaceId, mode, message, history }
router.post('/chat', aiTutorController.tutorChat);

module.exports = router;
