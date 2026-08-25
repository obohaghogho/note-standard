'use strict';

/**
 * CryptoRiskEngine
 * ================
 * Centralized risk & compliance evaluation engine.
 * Evaluates withdrawal velocity, KYC/AML status, 2FA codes,
 * dynamic risk policies from DB, and multi-signature approval rules.
 *
 * Risk Tiers (USD-value based):
 *   AUTO_LOW      < $500 USD      — fully automatic, no review
 *   AUTO_REVIEW   $500–$2,500     — auto-approved but flagged for review
 *   SINGLE_ADMIN  $2,500–$10,000  — 1 admin approval required
 *   DUAL_ADMIN    > $10,000       — 2 distinct admin approvals required
 *
 * Additional guards:
 *   - Per-tx hard ceiling (BTC $50K, ETH $25K, stables $50K)
 *   - Daily velocity cap: max 5 withdrawals / 24h
 *   - Daily USD volume cap: >$25K/day → SINGLE_ADMIN minimum
 */

const pool = require('../../config/pgPool');
const Decimal = require('decimal.js');
const logger = require('../../utils/logger');

class CryptoRiskEngine {
  /**
   * Evaluate a withdrawal request for risk compliance.
   * Returns: { allowed, tier, requiredApprovals, approvalStatus, txStatus, requiresManualReview, estimatedUsdValue }
   */
  async evaluateWithdrawal({ userId, currency, amount, user2FAVerified = true, ipAddress = null }) {
    const upCurrency = String(currency).toUpperCase();
    const decAmount = new Decimal(amount);

    // ── 1. Wallet State Check ────────────────────────────────────────────────
    const walletRes = await pool.query(
      `SELECT status FROM public.crypto_wallets WHERE user_id = $1 AND currency = $2`,
      [userId, upCurrency]
    );
    if (walletRes.rows.length > 0 && walletRes.rows[0].status !== 'ACTIVE') {
      throw new Error(`RISK_REJECT: Wallet status is '${walletRes.rows[0].status}'. Withdrawals restricted.`);
    }

    // ── 2. USD Value Estimation ──────────────────────────────────────────────
    // CRITICAL: BTC/ETH have small token counts but massive USD value.
    // Without USD conversion, 5 BTC (~$475K) would score as AUTO_LOW (5 < 1000).
    // Reference prices are conservative — update periodically via DB config.
    const refPricesUsd = {
      BTC:  95000,  // conservative BTC/USD reference
      ETH:  3500,   // conservative ETH/USD reference
      USDT: 1,
      USDC: 1,
    };
    const priceUsd = refPricesUsd[upCurrency] || 1;
    const estimatedUsdValue = decAmount.mul(priceUsd);

    // Per-transaction hard ceiling (enforced regardless of DB policy)
    const perTxCeilingsUsd = {
      BTC:  50000,   // $50K max per BTC withdrawal without dual admin
      ETH:  25000,   // $25K max per ETH withdrawal
      USDT: 50000,
      USDC: 50000,
    };
    const perTxCeilingUsd = perTxCeilingsUsd[upCurrency] || 50000;

    // ── 3. DB Policy Lookup ──────────────────────────────────────────────────
    const policyRes = await pool.query(
      `SELECT * FROM public.crypto_risk_policies
       WHERE (currency = $1 OR currency = 'ALL')
         AND $2 >= min_amount AND $2 <= max_amount
       ORDER BY required_approvals DESC LIMIT 1`,
      [upCurrency, decAmount.toNumber()]
    );
    let policy = policyRes.rows[0];

    // ── 4. USD-Value Tier (safety override) ─────────────────────────────────
    // Always apply the STRICTER of: DB token-amount policy OR USD-value tier.
    let usdTier, usdRequiredApprovals, usdManualReview;

    if (estimatedUsdValue.gt(perTxCeilingUsd) || estimatedUsdValue.gt(10000)) {
      usdTier              = 'DUAL_ADMIN';
      usdRequiredApprovals = 2;
      usdManualReview      = true;
    } else if (estimatedUsdValue.gt(2500)) {
      usdTier              = 'SINGLE_ADMIN';
      usdRequiredApprovals = 1;
      usdManualReview      = true;
    } else if (estimatedUsdValue.gt(500)) {
      usdTier              = 'AUTO_REVIEW';
      usdRequiredApprovals = 0;
      usdManualReview      = true;
    } else {
      usdTier              = 'AUTO_LOW';
      usdRequiredApprovals = 0;
      usdManualReview      = false;
    }

    if (!policy) {
      // No DB policy matched — use USD tier as fallback
      policy = {
        tier: usdTier,
        required_approvals: usdRequiredApprovals,
        requires_2fa: true,
        requires_manual_review: usdManualReview,
      };
    } else if (usdRequiredApprovals > (policy.required_approvals || 0)) {
      // USD tier is stricter than DB policy — upgrade
      policy = {
        ...policy,
        tier: usdTier,
        required_approvals: usdRequiredApprovals,
        requires_manual_review: true,
      };
    }

    // ── 5. 2FA Enforcement ───────────────────────────────────────────────────
    if (policy.requires_2fa && !user2FAVerified) {
      throw new Error('2FA_REQUIRED: 2FA verification is mandatory for crypto withdrawals.');
    }

    // ── 6. Daily Velocity Limit (max 5 withdrawals / 24h) ───────────────────
    const velocityRes = await pool.query(
      `SELECT COUNT(*) FROM public.crypto_transactions
       WHERE user_id = $1 AND type = 'WITHDRAWAL'
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    const dailyCount = parseInt(velocityRes.rows[0].count, 10);
    if (dailyCount >= 5) {
      throw new Error('VELOCITY_LIMIT_EXCEEDED: Maximum daily withdrawal count reached (5 txs/24h).');
    }

    // ── 7. Daily USD Volume Cap ($25K/day — above that → SINGLE_ADMIN min) ──
    const dailyVolumeRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM public.crypto_transactions
       WHERE user_id = $1 AND type = 'WITHDRAWAL'
         AND created_at > NOW() - INTERVAL '24 hours'
         AND status NOT IN ('CANCELLED', 'FAILED')`,
      [userId]
    );
    const dailyTokenVolume = new Decimal(dailyVolumeRes.rows[0].total || 0);
    const dailyUsdVolumeTotal = dailyTokenVolume.mul(priceUsd).plus(estimatedUsdValue);

    if (dailyUsdVolumeTotal.gt(25000) && (policy.required_approvals || 0) < 1) {
      policy.tier = 'SINGLE_ADMIN';
      policy.required_approvals = 1;
      policy.requires_manual_review = true;
      logger.warn(
        `[CryptoRiskEngine] Daily USD volume cap triggered for user ${userId}: ~$${dailyUsdVolumeTotal.toFixed(2)} cumulative`
      );
    }

    const requiredApprovals = policy.required_approvals || 0;
    const approvalStatus    = requiredApprovals > 0 ? 'PENDING_APPROVAL' : 'NOT_REQUIRED';
    const txStatus          = requiredApprovals > 0 ? 'PENDING_APPROVAL' : 'PENDING';

    logger.info(
      `[CryptoRiskEngine] Evaluated withdrawal: Amt: ${decAmount.toString()} ${upCurrency}` +
      ` (~$${estimatedUsdValue.toFixed(2)} USD), Tier: ${policy.tier}, Approvals Required: ${requiredApprovals}`
    );

    return {
      allowed: true,
      tier: policy.tier,
      requiredApprovals,
      approvalStatus,
      txStatus,
      requiresManualReview: policy.requires_manual_review || false,
      estimatedUsdValue: estimatedUsdValue.toFixed(2),
    };
  }

  /**
   * Record admin multi-signature approval action
   */
  async recordAdminApproval({ transactionId, adminId, action, reason = null, ipAddress = null }) {
    const client = await pool.connect();
    const upAction = String(action).toUpperCase();

    if (!['APPROVED', 'REJECTED'].includes(upAction)) {
      throw new Error('INVALID_APPROVAL_ACTION');
    }

    try {
      await client.query('BEGIN');

      const txRes = await client.query(
        `SELECT * FROM public.crypto_transactions WHERE id = $1 FOR UPDATE`,
        [transactionId]
      );
      if (txRes.rows.length === 0) throw new Error('TRANSACTION_NOT_FOUND');
      const tx = txRes.rows[0];

      if (tx.approval_status === 'APPROVED' || tx.status === 'COMPLETED') {
        await client.query('COMMIT');
        return { success: true, transaction: tx, message: 'Transaction already finalized.' };
      }

      // Record approval log
      await client.query(
        `INSERT INTO public.crypto_payout_approvals (transaction_id, admin_id, action, reason, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [transactionId, adminId, upAction, reason, ipAddress]
      );

      if (upAction === 'REJECTED') {
        const updatedTx = await client.query(
          `UPDATE public.crypto_transactions
           SET status = 'CANCELLED', approval_status = 'REJECTED', updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [transactionId]
        );
        await client.query('COMMIT');
        return { success: true, transaction: updatedTx.rows[0], status: 'REJECTED' };
      }

      // Count distinct admin approvals
      const countRes = await client.query(
        `SELECT COUNT(DISTINCT admin_id) FROM public.crypto_payout_approvals
         WHERE transaction_id = $1 AND action = 'APPROVED'`,
        [transactionId]
      );
      const currentApprovals = parseInt(countRes.rows[0].count, 10);
      const required = tx.required_approvals || 1;

      let newApprovalStatus = tx.approval_status;
      let newStatus = tx.status;

      if (currentApprovals >= required) {
        newApprovalStatus = 'APPROVED';
        newStatus = 'PROCESSING'; // Ready for payout execution
      }

      const updatedTx = await client.query(
        `UPDATE public.crypto_transactions
         SET approvals_count = $1, approval_status = $2, status = $3, updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [currentApprovals, newApprovalStatus, newStatus, transactionId]
      );

      await client.query('COMMIT');
      logger.info(`[CryptoRiskEngine] Admin ${adminId} ${upAction} tx ${transactionId}. Approvals: ${currentApprovals}/${required}`);
      return { success: true, transaction: updatedTx.rows[0], currentApprovals, requiredApprovals: required };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Change user wallet state (ACTIVE, FROZEN, REVIEW, SUSPENDED, CLOSED)
   */
  async updateWalletState(userId, currency, newState, adminId = null, reason = null) {
    const upState = String(newState).toUpperCase();
    if (!['ACTIVE', 'FROZEN', 'REVIEW', 'SUSPENDED', 'CLOSED'].includes(upState)) {
      throw new Error('INVALID_WALLET_STATE');
    }

    const res = await pool.query(
      `UPDATE public.crypto_wallets
       SET status = $1, version = version + 1, updated_at = NOW()
       WHERE user_id = $2 AND currency = $3
       RETURNING *`,
      [upState, userId, String(currency).toUpperCase()]
    );

    if (res.rows.length === 0) throw new Error('WALLET_NOT_FOUND');

    await pool.query(
      `INSERT INTO public.crypto_audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'WALLET_STATE_CHANGE', 'crypto_wallets', $2, $3)`,
      [userId, res.rows[0].id, JSON.stringify({ old_status: res.rows[0].status, new_status: upState, admin_id: adminId, reason })]
    );

    return res.rows[0];
  }
}

module.exports = new CryptoRiskEngine();
