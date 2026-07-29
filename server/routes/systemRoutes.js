'use strict';
/**
 * systemRoutes.js
 * ===============
 * Public system status & cross-provider transaction tracing routes.
 *
 * GET /api/system/status            Public status for web/mobile badges
 * GET /api/system/trace/:id         Cross-provider end-to-end correlation trace
 *
 * @module routes/systemRoutes
 */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/systemStatusController');

router.get('/status',    ctrl.getPublicSystemStatus);
router.get('/trace/:id', ctrl.getTransactionTrace);

module.exports = router;
