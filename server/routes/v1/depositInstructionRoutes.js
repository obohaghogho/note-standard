'use strict';

const express = require('express');
const router = express.Router();
const PaymentIntentEngine = require('../../services/payment/PaymentIntentEngine');
const CollectionAccountService = require('../../services/payment/CollectionAccountService');
const DepositReferenceService = require('../../services/payment/DepositReferenceService');
const DepositInstructionPolicyService = require('../../services/payment/DepositInstructionPolicyService');

let db = null;
try {
  db = require('../../config/database');
} catch (e) {}

const paymentIntentEngine = new PaymentIntentEngine(db);
const collectionAccountService = new CollectionAccountService(db);
const depositRefService = new DepositReferenceService(db);
const policyService = new DepositInstructionPolicyService({
  collectionAccountService,
  depositRefService,
  paymentIntentEngine
});

/**
 * POST /api/v1/wallets/:currency/deposit-instructions
 * Generates fresh payment intent, unique deposit reference, and returns merchant collection account details.
 */
router.post('/wallets/:currency/deposit-instructions', async (req, res) => {
  try {
    const currency = String(req.params.currency || 'USD').toUpperCase();
    const { amount = 0, rail = null, provider = 'fincra', amountValidationMode = 'OPEN_AMOUNT' } = req.body || {};
    const userId = req.user ? (req.user.id || req.user.sub) : (req.body.userId || 'usr_default_demo');

    const result = await policyService.generateDepositInstructions({
      userId,
      walletAccountId: req.body.walletAccountId || null,
      currency,
      amount,
      rail,
      provider,
      amountValidationMode
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: err.message,
      code: err.code || 'DEPOSIT_INSTRUCTION_ERROR'
    });
  }
});

module.exports = router;
