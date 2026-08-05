const express = require('express');
const router = express.Router();
const feedbackController = require('../../controllers/feedbackController');
const { requireAuth, requireAdmin } = require('../../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

// Rate limiter: Max 10 feedback submissions per 15 minutes per IP
const feedbackSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many feedback reports submitted. Please try again later.' }
});

// Public / Authenticated Routes
router.post('/reports', feedbackSubmissionLimiter, feedbackController.createReport);
router.post('/crashes', feedbackController.ingestCrash);
router.get('/reports/me', requireAuth, feedbackController.getUserReports);
router.get('/reports/:id', feedbackController.getReportById);
router.post('/reports/:id/vote', requireAuth, feedbackController.toggleVote);
router.post('/reports/:id/comments', requireAuth, feedbackController.addComment);

// Admin & Developer Management Routes
router.get('/reports', requireAdmin, feedbackController.getReports);
router.patch('/reports/:id', requireAdmin, feedbackController.updateReport);
router.get('/analytics', requireAdmin, feedbackController.getAnalytics);

module.exports = router;
