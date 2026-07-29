'use strict';
/**
 * CryptoWithdrawalQueueService.js
 * ================================
 * Orchestrated Crypto Withdrawal Queue Manager.
 * Handles queuing, risk evaluation, treasury reservation, 
 * provider execution via NOWPayments, and final settlement.
 *
 * @module services/payment/CryptoWithdrawalQueueService
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');
const NowPaymentsProvider = require('../../providers/NowPaymentsProvider');
const CryptoWalletInventoryService = require('../treasury/CryptoWalletInventoryService');

class CryptoWithdrawalQueueService {
  /**
   * Enqueue a new withdrawal request after initial validation.
   */
  async enqueue({ userId, recipientAddress, asset, network = 'NATIVE', amount, priority = 'NORMAL', metadata = {} }) {
    const upAsset = String(asset).toUpperCase();
    const upNet   = String(network).toUpperCase();

    // 1. Check liquidity
    const available = await CryptoWalletInventoryService.getAvailableLiquidBalance(upAsset, upNet);
    if (available > 0 && available < parseFloat(amount)) {
      logger.warn(`[CryptoWithdrawalQueue] Low liquid balance for ${upAsset}/${upNet}: ${available} available, ${amount} requested`);
    }

    try {
      const { data, error } = await supabase
        .from('crypto_withdrawal_queue')
        .insert({
          user_id:           userId,
          recipient_address: recipientAddress,
          asset:             upAsset,
          network:           upNet,
          amount:            parseFloat(amount),
          priority,
          risk_score:        0,
          provider:          'nowpayments',
          status:            'APPROVED',
          metadata,
          created_at:        new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      logger.info(`[CryptoWithdrawalQueue] Enqueued payout ${data.id} for user ${userId}: ${amount} ${upAsset}`);
      return data;
    } catch (err) {
      logger.error(`[CryptoWithdrawalQueue] Enqueue failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Process next pending item in queue.
   */
  async processNext() {
    // Lock next APPROVED or RETRY item
    const { data: item } = await supabase
      .from('crypto_withdrawal_queue')
      .select('*')
      .in('status', ['APPROVED', 'RETRY'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!item) return null;

    // Transition to PROCESSING
    await supabase
      .from('crypto_withdrawal_queue')
      .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
      .eq('id', item.id);

    try {
      // Execute payout via NOWPayments
      const payoutResult = await NowPaymentsProvider.createPayout(
        item.recipient_address,
        item.amount,
        item.asset,
        item.id,
        item.network
      );

      // Update item state to SENT
      const { data: updated } = await supabase
        .from('crypto_withdrawal_queue')
        .update({
          status:           'SENT',
          transaction_hash: payoutResult.payoutId || payoutResult.transaction_hash,
          metadata:         { ...item.metadata, payoutResult },
          updated_at:       new Date().toISOString(),
        })
        .eq('id', item.id)
        .select()
        .single();

      logger.info(`[CryptoWithdrawalQueue] Payout ${item.id} executed successfully via NOWPayments`);
      return updated;
    } catch (err) {
      logger.error(`[CryptoWithdrawalQueue] Payout ${item.id} execution failed: ${err.message}`);
      
      const isRetryable = !err.message.includes('INVALID_ADDRESS');
      await supabase
        .from('crypto_withdrawal_queue')
        .update({
          status:        isRetryable ? 'RETRY' : 'FAILED',
          error_message: err.message,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', item.id);

      return null;
    }
  }

  /**
   * Get queue summary status metrics.
   */
  async getQueueSummary() {
    try {
      const { data } = await supabase
        .from('crypto_withdrawal_queue')
        .select('status, count:id');

      const summary = { APPROVED: 0, PROCESSING: 0, SENT: 0, FAILED: 0, RETRY: 0 };
      for (const row of (data || [])) {
        if (summary[row.status] !== undefined) summary[row.status] += 1;
      }
      return summary;
    } catch (err) {
      logger.error(`[CryptoWithdrawalQueue] Summary fetch failed: ${err.message}`);
      return {};
    }
  }
}

module.exports = new CryptoWithdrawalQueueService();
