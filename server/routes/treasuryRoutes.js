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
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/overview', treasuryController.getOverview);
router.get('/banking/instructions', treasuryController.getDepositInstructions);
router.get('/banking/deposit-instructions', treasuryController.getDepositInstructions);
router.get('/banking/unallocated', requireAdmin, treasuryController.getUnallocatedDeposits);
router.post('/banking/assign', requireAdmin, treasuryController.assignUnallocatedDeposit);

router.get('/grey/daily-limit', treasuryController.getGreyDailyLimit);
router.get('/predictive-liquidity', treasuryController.getPredictiveLiquidity);
router.get('/ai-risk', treasuryController.getAIRiskReport);

router.post('/payout', treasuryController.processPayout);
router.post('/rebalance', requireAdmin, treasuryController.triggerRebalance);
router.post('/reconcile', requireAdmin, treasuryController.triggerReconciliation);
router.post('/fund-provider', requireAdmin, treasuryController.fundProvider);

module.exports = router;
