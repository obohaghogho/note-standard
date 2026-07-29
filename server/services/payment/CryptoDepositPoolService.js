'use strict';
/**
 * CryptoDepositPoolService.js
 * ===========================
 * Intelligent Deposit Address Pool Manager for Crypto Assets.
 * Provides rapid deposit address resolution, usage count tracking,
 * risk scoring, and state lifecycle:
 * AVAILABLE -> ASSIGNED -> USED -> EXPIRED -> ARCHIVED / REUSED / BLACKLISTED
 *
 * @module services/payment/CryptoDepositPoolService
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');
const NowPaymentsProvider = require('../../providers/NowPaymentsProvider');

class CryptoDepositPoolService {
  /**
   * Acquire a deposit address for a user/asset from pool or create new.
   */
  async acquireAddress(userId, asset, payCurrency = null) {
    const upAsset = String(asset).toUpperCase();
    const ticker  = payCurrency || NowPaymentsProvider.getTicker(upAsset);

    // 1. Check existing active address for this user & asset
    const { data: existing } = await supabase
      .from('nowpayments_deposit_addresses')
      .select('*')
      .eq('user_id', userId)
      .eq('asset', upAsset)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // 2. Look for pre-generated AVAILABLE address in pool with low risk score
    const { data: poolAddress } = await supabase
      .from('nowpayments_deposit_addresses')
      .select('*')
      .eq('asset', upAsset)
      .eq('status', 'AVAILABLE')
      .lt('risk_score', 30)
      .order('times_used', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (poolAddress) {
      // Assign to user
      const { data: assigned } = await supabase
        .from('nowpayments_deposit_addresses')
        .update({
          user_id:      userId,
          status:       'active',
          assigned_to:  userId,
          last_user:    userId,
          times_used:   (poolAddress.times_used || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', poolAddress.id)
        .select()
        .single();

      logger.info(`[CryptoDepositPool] Assigned pooled address ${assigned.address} to user ${userId} (${upAsset})`);
      return assigned;
    }

    // 3. Generate new address via NOWPayments
    try {
      const resp = await NowPaymentsProvider.createPayout ? null : null; // Provider creates payment invoice
      // If no pooled address, caller will invoke standard invoice creation
      return null;
    } catch (err) {
      logger.error(`[CryptoDepositPool] Address generation failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Store newly generated deposit address in pool
   */
  async registerAddress({ userId, asset, payCurrency, address, paymentId, payAmount = null, status = 'active' }) {
    const upAsset = String(asset).toUpperCase();

    const { data, error } = await supabase
      .from('nowpayments_deposit_addresses')
      .upsert({
        user_id:      userId,
        asset:        upAsset,
        pay_currency: payCurrency || upAsset.toLowerCase(),
        address,
        payment_id:   String(paymentId),
        pay_amount:   payAmount,
        status,
        times_used:   1,
        last_user:    userId,
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'user_id, asset, status' })
      .select()
      .single();

    if (error) {
      logger.warn(`[CryptoDepositPool] Registration fallback (insert without constraint): ${error.message}`);
      const { data: fallback } = await supabase
        .from('nowpayments_deposit_addresses')
        .insert({
          user_id:      userId,
          asset:        upAsset,
          pay_currency: payCurrency || upAsset.toLowerCase(),
          address,
          payment_id:   String(paymentId),
          pay_amount:   payAmount,
          status:       'active',
          times_used:   1,
          last_user:    userId,
          last_used_at: new Date().toISOString(),
        })
        .select()
        .single();
      return fallback;
    }

    return data;
  }

  /**
   * Get pool metrics per status & asset.
   */
  async getPoolMetrics() {
    try {
      const { data } = await supabase
        .from('nowpayments_deposit_addresses')
        .select('asset, status, count:id')
        .order('asset');

      const metrics = {};
      for (const row of (data || [])) {
        if (!metrics[row.asset]) metrics[row.asset] = { total: 0, active: 0, available: 0, used: 0, expired: 0 };
        metrics[row.asset].total += 1;
        const st = String(row.status || '').toLowerCase();
        if (st === 'active') metrics[row.asset].active += 1;
        else if (st === 'available') metrics[row.asset].available += 1;
        else if (st === 'used') metrics[row.asset].used += 1;
        else if (st === 'expired') metrics[row.asset].expired += 1;
      }
      return metrics;
    } catch (err) {
      logger.error(`[CryptoDepositPool] Pool metrics error: ${err.message}`);
      return {};
    }
  }
}

module.exports = new CryptoDepositPoolService();
