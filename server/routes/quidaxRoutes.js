'use strict';

const express = require('express');
const router = express.Router();
const quidaxController = require('../controllers/quidaxController');

/**
 * Quidax Webhook Endpoint
 * POST /api/webhooks/quidax
 */
router.post('/webhook', (req, res) => quidaxController.handleWebhook(req, res));
router.post('/', (req, res) => quidaxController.handleWebhook(req, res));

module.exports = router;
