const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/payment/webhookController");

// Paystack Webhook Route (Deprecated: Use /api/webhooks/paystack instead)
router.post("/webhook", webhookController.handlePaystack);

module.exports = router;
