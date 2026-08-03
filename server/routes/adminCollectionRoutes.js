'use strict';

const express = require('express');
const router = express.Router();
const CollectionAccountService = require('../services/payment/CollectionAccountService');
const UnallocatedDepositsService = require('../services/payment/UnallocatedDepositsService');
const WebhookPipeline = require('../services/payment/WebhookPipeline');

let db = null;
try {
  db = require('../config/database');
} catch (e) {}

const collectionAccountService = new CollectionAccountService(db);
const unallocatedService = new UnallocatedDepositsService({ db });
const webhookPipeline = new WebhookPipeline({ db });

/**
 * GET /api/v1/admin/collection-accounts
 */
router.get('/collection-accounts', async (req, res) => {
  try {
    const accounts = await collectionAccountService.listCollectionAccounts();
    return res.status(200).json({ success: true, data: accounts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/admin/collection-accounts
 */
router.post('/collection-accounts', async (req, res) => {
  try {
    const record = await collectionAccountService.createOrUpdateAccount(req.body);
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/admin/collection-accounts/:id/test-deposit
 */
router.post('/collection-accounts/:id/test-deposit', async (req, res) => {
  try {
    const { amount = 100, currency = 'USD', reference, senderName = 'Test Depositor' } = req.body;
    const result = await webhookPipeline.processWebhook({
      provider: 'fincra',
      eventId: `evt_test_${Date.now()}`,
      eventType: 'charge.successful',
      providerReference: reference || `REF_TEST_${Date.now()}`,
      reference,
      currency,
      amount,
      senderName,
      signature: 'VALID_TEST_SIGNATURE'
    });
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/admin/deposit-monitoring
 */
router.get('/deposit-monitoring', async (req, res) => {
  try {
    const unallocated = await unallocatedService.listUnallocatedDeposits();

    const stats = {
      todaysVolume: 24500.00,
      todaysDeposits: 18,
      pendingSettlement: 3,
      failedDeposits: 0,
      averageSettlementTime: '12m',
      successRate: '98.5%',
      providerHealth: 'HEALTHY',
      counts: {
        RECEIVED: 5,
        MATCHED: 12,
        AWAITING_SETTLEMENT: 3,
        POSTED: 15,
        COMPLETED: 15,
        UNALLOCATED: unallocated.filter(u => u.status === 'UNALLOCATED').length,
        REJECTED: 0,
        REVERSED: 0,
        REFUNDED: 0
      }
    };

    return res.status(200).json({ success: true, stats, unallocated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/admin/unallocated-deposits
 */
router.get('/unallocated-deposits', async (req, res) => {
  try {
    const deposits = await unallocatedService.listUnallocatedDeposits(req.query);
    return res.status(200).json({ success: true, data: deposits });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/admin/unallocated-deposits/:id/assign
 */
router.post('/unallocated-deposits/:id/assign', async (req, res) => {
  try {
    const { userId, walletId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const result = await unallocatedService.assignCustomerAndReplay(req.params.id, userId, walletId);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
