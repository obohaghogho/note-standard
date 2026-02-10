const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { requireAuth } = require('../middleware/auth');

router.post('/create-checkout-session', requireAuth, subscriptionController.createCheckoutSession);
router.post('/create-portal-session', requireAuth, subscriptionController.createPortalSession);
router.get('/status', requireAuth, subscriptionController.getSubscriptionStatus);
router.post('/sync', requireAuth, subscriptionController.syncSubscription);

module.exports = router;
