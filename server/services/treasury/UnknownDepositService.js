'use strict';

const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const DepositMatchingService = require('./DepositMatchingService');
const AuditLogService = require('../AuditLogService');

/**
 * UnknownDepositService
 * =====================
 * Management & Resolution Service for Unallocated / Unknown Deposits Queue.
 */
class UnknownDepositService {
  /**
   * Fetch all pending unallocated deposits needing review
   */
  async getPendingReviews() {
    const { data, error } = await supabase
      .from('unallocated_deposits')
      .select('*')
      .in('status', ['PENDING_REVIEW', 'UNALLOCATED'])
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(`[UnknownDepositService] Error fetching unallocated deposits: ${error.message}`);
      throw error;
    }

    return data || [];
  }

  /**
   * Manually assign an unallocated deposit to a target user
   */
  async assignUser({ unallocatedId, userId, adminId }) {
    logger.info(`[UnknownDepositService] Admin ${adminId} assigning deposit ${unallocatedId} to user ${userId}`);

    const { data: unalloc, error: fErr } = await supabase
      .from('unallocated_deposits')
      .select('*')
      .eq('id', unallocatedId)
      .single();

    if (fErr || !unalloc) {
      throw new Error('Unallocated deposit record not found');
    }

    // Execute credit via DepositMatchingService
    const result = await DepositMatchingService._executeAutoCredit(
      {
        amount: unalloc.amount,
        currency: unalloc.currency,
        rail: unalloc.rail,
        providerTxId: unalloc.id,
        fee: 0
      },
      { user_id: userId, reference: 'MANUAL_ASSIGN' },
      100,
      unalloc.id
    );

    // Update unallocated deposit record
    await supabase
      .from('unallocated_deposits')
      .update({
        status: 'RESOLVED_ASSIGNED',
        assigned_user_id: userId,
        resolved_by: adminId,
        resolved_at: new Date().toISOString()
      })
      .eq('id', unallocatedId);

    AuditLogService.log({
      user_id: adminId,
      action: 'unknown_deposit_assigned',
      target_id: unallocatedId,
      assigned_user_id: userId,
      amount: unalloc.amount
    }).catch(() => {});

    return {
      success: true,
      unallocatedId,
      assignedUserId: userId,
      transactionResult: result
    };
  }

  /**
   * Refund unallocated deposit to original sender
   */
  async refund({ unallocatedId, destinationAccount, adminId }) {
    const { data: unalloc } = await supabase
      .from('unallocated_deposits')
      .select('*')
      .eq('id', unallocatedId)
      .single();

    if (!unalloc) throw new Error('Record not found');

    await supabase
      .from('unallocated_deposits')
      .update({
        status: 'RESOLVED_REFUNDED',
        resolved_by: adminId,
        resolved_at: new Date().toISOString()
      })
      .eq('id', unallocatedId);

    return { success: true, unallocatedId, status: 'RESOLVED_REFUNDED' };
  }

  /**
   * Reject unallocated deposit
   */
  async reject({ unallocatedId, reason, adminId }) {
    await supabase
      .from('unallocated_deposits')
      .update({
        status: 'REJECTED',
        reason,
        resolved_by: adminId,
        resolved_at: new Date().toISOString()
      })
      .eq('id', unallocatedId);

    return { success: true, unallocatedId, status: 'REJECTED', reason };
  }
}

module.exports = new UnknownDepositService();
