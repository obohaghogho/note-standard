const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { requireAuth } = require('../middleware/auth');

// All support routes require user authentication
router.use(requireAuth);

// POST /api/feedback (Submit Support Ticket - B-12)
router.post('/', supportController.createTicket);

// GET /api/feedback/my-feedback (Get User Tickets - B-12)
router.get('/my-feedback', supportController.getMyTickets);

module.exports = router;
