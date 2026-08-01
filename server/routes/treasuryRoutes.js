'use strict';

/**
 * treasuryRoutes.js
 * =================
 * Express routes for NoteStandard Enterprise Treasury & Liquidity Platform.
 *
 * @module routes/treasuryRoutes
 */

const express = require('express');
const router = express.Router();
const treasuryController = require('../controllers/treasuryController');

router.get('/overview', treasuryController.getOverview);
router.get('/predictive-liquidity', treasuryController.getPredictiveLiquidity);
router.get('/ai-risk', treasuryController.getAIRiskReport);
router.post('/rebalance', treasuryController.triggerRebalance);
router.post('/reconcile', treasuryController.triggerReconciliation);
router.post('/fund-provider', treasuryController.fundProvider);

module.exports = router;
