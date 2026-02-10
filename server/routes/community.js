const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { createCommunityPost } = require('../controllers/communityController');

router.use(requireAuth);

router.post('/post', createCommunityPost);

module.exports = router;
