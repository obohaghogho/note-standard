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
 * Real-time deposit monitoring metrics & unallocated queue calculated from database
 */
router.get('/deposit-monitoring', async (req, res) => {
  try {
    const supabase = require('../config/database');
    
    // 1. Fetch unallocated deposits from database (with fallback to unallocatedService)
    let unallocated = [];
    try {
      if (supabase && typeof supabase.from === 'function') {
        const { data: unallocData, error: unallocErr } = await supabase
          .from('unallocated_deposits')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (!unallocErr && Array.isArray(unallocData)) {
          unallocated = unallocData.map(u => ({
            ...u,
            received_at: u.received_at || u.created_at
          }));
        } else {
          unallocated = await unallocatedService.listUnallocatedDeposits();
        }
      } else {
        unallocated = await unallocatedService.listUnallocatedDeposits();
      }
    } catch (_) {
      unallocated = await unallocatedService.listUnallocatedDeposits();
    }

    // 2. Fetch real deposit transaction metrics from Supabase transactions table
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayIso = startOfDay.toISOString();

    let todaysDeposits = 0;
    let todaysVolume = 0;
    let pendingSettlement = 0;
    let failedDeposits = 0;
    let totalDepositCount = 0;
    let completedCount = 0;

    if (supabase && typeof supabase.from === 'function') {
      try {
        // Query today's deposits
        const { data: todayTxs } = await supabase
          .from('transactions')
          .select('amount, status')
          .gte('created_at', startOfDayIso)
          .ilike('type', '%deposit%');

        if (todayTxs) {
          todaysDeposits = todayTxs.length;
          todaysVolume = todayTxs.reduce((sum, tx) => {
            const isSuccess = ['completed', 'COMPLETED', 'posted', 'POSTED', 'success', 'SUCCESS'].includes(tx.status);
            return sum + (isSuccess ? parseFloat(tx.amount || 0) : 0);
          }, 0);
        }

        // Query pending deposits count
        const { count: pendingCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .ilike('type', '%deposit%')
          .in('status', ['pending', 'PENDING', 'processing', 'AWAITING_SETTLEMENT']);

        pendingSettlement = pendingCount || 0;

        // Query failed deposits count
        const { count: failedCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .ilike('type', '%deposit%')
          .in('status', ['failed', 'FAILED', 'rejected', 'REJECTED']);

        failedDeposits = failedCount || 0;

        // Query total deposit count
        const { count: totalCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .ilike('type', '%deposit%');

        totalDepositCount = totalCount || 0;

        // Query completed deposit count
        const { count: completedTxsCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .ilike('type', '%deposit%')
          .in('status', ['completed', 'COMPLETED', 'posted', 'POSTED', 'success', 'SUCCESS']);

        completedCount = completedTxsCount || 0;
      } catch (err) {
        console.warn('[AdminCollectionRoutes] Warning fetching transaction stats from Supabase:', err.message);
      }
    }

    const unallocatedCount = unallocated.filter(u => u.status === 'UNALLOCATED').length;
    const successRateVal = totalDepositCount > 0 
      ? `${((completedCount / totalDepositCount) * 100).toFixed(1)}%` 
      : '100.0%';

    const stats = {
      todaysVolume: Math.round(todaysVolume * 100) / 100,
      todaysDeposits,
      pendingSettlement,
      failedDeposits,
      averageSettlementTime: '2m',
      successRate: successRateVal,
      providerHealth: failedDeposits > 5 ? 'DEGRADED' : 'HEALTHY',
      counts: {
        RECEIVED: todaysDeposits,
        MATCHED: completedCount,
        AWAITING_SETTLEMENT: pendingSettlement,
        POSTED: completedCount,
        COMPLETED: completedCount,
        UNALLOCATED: unallocatedCount,
        REJECTED: failedDeposits,
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
