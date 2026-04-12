const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.post('/attachments', mediaController.createAttachmentRecord);
router.post('/process-audio', mediaController.processAudio);
router.get('/signed-url', mediaController.getSignedUrl);

module.exports = router;
