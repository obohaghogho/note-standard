'use strict';

const express = require('express');
const router = express.Router();
const cryptoLedgerService = require('../services/CryptoLedgerService');
const cryptoRiskEngine = require('../services/risk/CryptoRiskEngine');
const treasuryService = require('../services/treasury/TreasuryService');
const nowpaymentsService = require('../services/nowpaymentsService');
const pool = require('../config/pgPool');
const { requireAuth } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// Enforce authentication on all crypto routes
router.use(requireAuth);

/**
 * GET /api/crypto/wallet
 * Returns user crypto wallets and total estimated USD portfolio value
 */
router.get('/wallet', async (req, res) => {
  try {
    const userId = req.user.id;
    const wallets = await cryptoLedgerService.getWallets(userId);
    
    // Estimate total portfolio value in USD
    let totalUsdEstimate = 0;
    for (const w of wallets) {
      if (['USDT', 'USDC'].includes(w.currency)) {
        totalUsdEstimate += parseFloat(w.total_balance);
      } else if (w.currency === 'BTC') {
        totalUsdEstimate += parseFloat(w.total_balance) * 65000; // Reference price fallback
      } else if (w.currency === 'ETH') {
        totalUsdEstimate += parseFloat(w.total_balance) * 3500;
      }
    }

    res.json({
      success: true,
      wallets,
      portfolioValueUsd: totalUsdEstimate.toFixed(2)
    });
  } catch (err) {
    logger.error(`[GET /api/crypto/wallet] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/crypto/addresses
 */
router.get('/addresses', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, provider_id as provider, currency, network, address, tag_or_memo, status, created_at
       FROM public.crypto_wallet_addresses
       WHERE user_id = $1 AND status = 'ACTIVE'`,
      [userId]
    );
    res.json({ success: true, addresses: result.rows });
  } catch (err) {
    logger.error(`[GET /api/crypto/addresses] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/crypto/address
 * Get or generate deposit address for currency & network
 */
router.post('/address', async (req, res) => {
  try {
    const userId = req.user.id;
    const { currency, network } = req.body;
    if (!currency || !network) {
      return res.status(400).json({ success: false, error: "CURRENCY_AND_NETWORK_REQUIRED" });
    }

    const upCurrency = String(currency).toUpperCase();
    const upNetwork = String(network).toUpperCase();

    // Check existing address in DB
    const existing = await pool.query(
      `SELECT * FROM public.crypto_wallet_addresses 
       WHERE user_id = $1 AND currency = $2 AND network = $3 AND status = 'ACTIVE' LIMIT 1`,
      [userId, upCurrency, upNetwork]
    );

    if (existing.rows.length > 0) {
      return res.json({ success: true, address: existing.rows[0] });
    }

    // Generate address from provider
    const real = await nowpaymentsService.getOrCreateDepositAddress(userId, upCurrency, upNetwork);
    
    const insertRes = await pool.query(
      `INSERT INTO public.crypto_wallet_addresses (user_id, provider_id, currency, network, address)
       VALUES ($1, 'NOWPAYMENTS', $2, $3, $4)
       ON CONFLICT (user_id, currency, network, address) DO UPDATE SET status = 'ACTIVE'
       RETURNING *`,
      [userId, upCurrency, upNetwork, real.address]
    );

    res.json({ success: true, address: insertRes.rows[0] });
  } catch (err) {
    logger.error(`[POST /api/crypto/address] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/crypto/history
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, currency, limit = 50 } = req.query;

    let query = `SELECT id, wallet_id, idempotency_key, type, currency, amount, fee, network, tx_hash, status, approval_status, metadata, created_at 
                 FROM public.crypto_transactions WHERE user_id = $1`;
    const params = [userId];

    if (type) {
      params.push(String(type).toUpperCase());
      query += ` AND type = $${params.length}`;
    }
    if (currency) {
      params.push(String(currency).toUpperCase());
      query += ` AND currency = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit, 10));

    const result = await pool.query(query, params);
    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    logger.error(`[GET /api/crypto/history] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/crypto/withdraw
 * Request crypto withdrawal
 */
router.post('/withdraw', async (req, res) => {
  try {
    const userId = req.user.id;
    const { currency, amount, network = 'NATIVE', destinationAddress, user2FAVerified = true } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;

    if (!currency || !amount || !destinationAddress) {
      return res.status(400).json({ success: false, error: "MISSING_REQUIRED_FIELDS" });
    }

    // 1. Evaluate Risk Compliance
    const riskResult = await cryptoRiskEngine.evaluateWithdrawal({
      userId,
      currency,
      amount,
      user2FAVerified
    });

    // 2. Lock Funds in Internal Ledger
    const lockRes = await cryptoLedgerService.lockFunds({
      userId,
      currency,
      amount,
      fee: 0,
      idempotencyKey,
      metadata: { destination_address: destinationAddress, network }
    });

    // If multi-sig approval required, hold transaction in PENDING_APPROVAL
    if (riskResult.requiredApprovals > 0) {
      await pool.query(
        `UPDATE public.crypto_transactions
         SET required_approvals = $1, approval_status = 'PENDING_APPROVAL', status = 'PENDING_APPROVAL'
         WHERE id = $2`,
        [riskResult.requiredApprovals, lockRes.transaction.id]
      );

      return res.json({
        success: true,
        status: 'PENDING_APPROVAL',
        payoutId: lockRes.transaction.id,
        requiredApprovals: riskResult.requiredApprovals,
        message: `Withdrawal held for multi-signature admin review (${riskResult.requiredApprovals} approval(s) required).`
      });
    }

    // 3. Execute Payout via Treasury Layer
    const payoutRes = await treasuryService.executePayout({
      address: destinationAddress,
      amount,
      currency,
      network,
      reference: lockRes.transaction.id
    });

    // 4. Finalize Internal Ledger
    const finalRes = await cryptoLedgerService.finalizePayout({
      transactionId: lockRes.transaction.id,
      providerId: payoutRes.providerId,
      txHash: payoutRes.payoutId
    });

    res.json({
      success: true,
      status: 'COMPLETED',
      payoutId: payoutRes.payoutId,
      transaction: finalRes.transaction
    });
  } catch (err) {
    logger.error(`[POST /api/crypto/withdraw] Error: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/crypto/transfer
 * Instant internal transfer (User A -> User B)
 */
router.post('/transfer', async (req, res) => {
  try {
    const senderId = req.user.id;
    const { recipientEmail, recipientId: reqRecipientId, currency, amount } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;

    if (!currency || !amount) {
      return res.status(400).json({ success: false, error: "CURRENCY_AND_AMOUNT_REQUIRED" });
    }

    let recipientId = reqRecipientId;
    if (!recipientId && recipientEmail) {
      const pRes = await pool.query(`SELECT id FROM public.profiles WHERE email = $1`, [recipientEmail]);
      if (pRes.rows.length === 0) return res.status(404).json({ success: false, error: "RECIPIENT_NOT_FOUND" });
      recipientId = pRes.rows[0].id;
    }

    if (!recipientId) {
      return res.status(400).json({ success: false, error: "RECIPIENT_ID_OR_EMAIL_REQUIRED" });
    }

    const result = await cryptoLedgerService.internalTransfer({
      senderId,
      recipientId,
      currency,
      amount,
      fee: 0,
      idempotencyKey
    });

    res.json({ success: true, transaction: result.transaction });
  } catch (err) {
    logger.error(`[POST /api/crypto/transfer] Error: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/crypto/swap
 * Atomic Swap (e.g. BTC -> USDT)
 */
router.post('/swap', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fromCurrency, toCurrency, fromAmount, toAmount } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;

    if (!fromCurrency || !toCurrency || !fromAmount || !toAmount) {
      return res.status(400).json({ success: false, error: "MISSING_SWAP_PARAMETERS" });
    }

    const result = await cryptoLedgerService.executeSwap({
      userId,
      fromCurrency,
      toCurrency,
      fromAmount,
      toAmount,
      fee: 0,
      idempotencyKey
    });

    res.json({ success: true, transaction: result.transaction });
  } catch (err) {
    logger.error(`[POST /api/crypto/swap] Error: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
