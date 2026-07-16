const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const creatorController = require('../controllers/creatorController');
const certificateController = require('../controllers/certificateController');

router.use(requireAuth);

// Creator Dashboard
router.get('/dashboard', creatorController.getDashboard);

// Recommendations (AI-powered content suggestions)
router.get('/recommendations', creatorController.getRecommendations);

// Drafts
router.get('/drafts', creatorController.getDrafts);
router.post('/drafts', creatorController.saveDraft);
router.put('/drafts/:id', creatorController.saveDraft);
router.delete('/drafts/:id', creatorController.deleteDraft);

// Certificates
router.post('/certificates/issue', certificateController.issueCertificate);
router.get('/certificates/verify/:token', certificateController.verifyCertificate);

module.exports = router;
