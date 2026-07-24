const express = require("express");
const router = express.Router();
const WebhookService = require("../services/WebhookService");

// Paystack Webhook Route (Deprecated: Use /api/webhooks/paystack instead)
router.post("/webhook", WebhookService.processPaystackWebhook.bind(WebhookService));

module.exports = router;
