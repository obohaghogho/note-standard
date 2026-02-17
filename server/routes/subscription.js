const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { requireAuth } = require('../middleware/auth');

router.post('/create-checkout-session', requireAuth, subscriptionController.createCheckoutSession);
router.post('/cancel', requireAuth, subscriptionController.cancelSubscription);
router.get('/status', requireAuth, subscriptionController.getSubscriptionStatus);
router.get('/rate', requireAuth, subscriptionController.getExchangeRate);
router.post('/sync', requireAuth, subscriptionController.syncSubscription);

module.exports = router;
