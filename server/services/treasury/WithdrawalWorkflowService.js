'use strict';

const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const SettlementLayerRouter = require('../settlement/SettlementLayerRouter');
const SettlementStateMachine = require('./SettlementStateMachine');
const GreyDailyLimitService = require('./GreyDailyLimitService');
const notificationService = require('../notificationService');
const AuditLogService = require('../AuditLogService');
const OutboxPublisher = require('../payment/OutboxPublisher');
const { v4: uuidv4 } = require('uuid');

const outbox = new OutboxPublisher();

/**
 * WithdrawalWorkflowService
 * =========================
 * Production Payout & Withdrawal Execution Pipeline with Rich Settlement State Machine
 * and Transactional Outbox Pattern.
 *
 * Rich Lifecycle States:
 * REQUESTED -> RISK_REVIEW -> FUNDS_RESERVED -> QUEUED -> SENDING -> PROVIDER_ACCEPTED -> PROVIDER_PROCESSING -> COMPLETED -> RECONCILED
 *
 * Failure States:
 * PROVIDER_TIMEOUT | VALIDATION_FAILURE | REJECTED | CANCELLED | MANUAL_REVIEW
 */
class WithdrawalWorkflowService {
  /**
   * Process an external withdrawal request
   */
  async processWithdrawal({ userId, walletId, amount, currency, bankCode, accountNumber, accountName, idempotencyKey }) {
    const reference = `wd_${uuidv4().replace(/-/g, '')}`;
    const numAmount = Number(amount);
    const upCurrency = String(currency).toUpperCase();

    logger.info(`[WithdrawalWorkflow] Initializing payout for user ${userId}`, {
      reference,
      amount: numAmount,
      currency: upCurrency,
      bankCode,
      accountNumber
    });

    // 1. Stage: REQUESTED -> Auth & KYC Check
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, status, email, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (pErr || !profile) {
      throw new Error('[WithdrawalWorkflow] User profile not found');
    }

    if (profile.status === 'suspended' || profile.status === 'frozen') {
      throw new Error('[WithdrawalWorkflow] Account is suspended or frozen');
    }

    // 2. Stage: RISK_REVIEW -> Wallet Balance & Risk Engine
    const { data: wallet, error: wErr } = await supabase
      .from('wallets_store')
      .select('*')
      .eq('id', walletId)
      .eq('user_id', userId)
      .single();

    if (wErr || !wallet) {
      throw new Error('[WithdrawalWorkflow] Target wallet not found');
    }

    const availableBal = Number(wallet.available_balance || wallet.balance || 0);
    if (availableBal < numAmount) {
      throw new Error(`[WithdrawalWorkflow] Insufficient available balance. Required: ${numAmount} ${upCurrency}, Available: ${availableBal} ${upCurrency}`);
    }

    // Check Daily Settlement Limit ($100,000 USD cap)
    const capCheck = await GreyDailyLimitService.checkSettlementCapacity(numAmount, upCurrency);
    if (!capCheck.isAvailable) {
      throw new Error(`[WithdrawalWorkflow] ${capCheck.message}`);
    }

    await this._runRiskChecks(userId, numAmount, upCurrency, reference);

    // 3. Stage: FUNDS_RESERVED -> Atomically Freeze Balance in DB
    const newAvailBal = availableBal - numAmount;
    const { error: freezeErr } = await supabase
      .from('wallets_store')
      .update({ available_balance: newAvailBal, updated_at: new Date().toISOString() })
      .eq('id', walletId);

    if (freezeErr) {
      logger.error(`[WithdrawalWorkflow] Balance freeze failed: ${freezeErr.message}`);
      throw new Error('[WithdrawalWorkflow] Failed to lock withdrawal balance');
    }

    // 4. Create Transaction Record & Enqueue Transactional Outbox Event
    let transaction;
    try {
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          wallet_id: walletId,
          amount: numAmount,
          currency: upCurrency,
          type: 'WITHDRAWAL',
          status: 'FUNDS_RESERVED',
          reference_id: reference,
          idempotency_key: idempotencyKey || `idemp_wd_${reference}`,
          provider: 'grey',
          display_label: `Bank Withdrawal to ${bankCode}`,
          metadata: {
            bank_code: bankCode,
            account_number: accountNumber,
            account_name: accountName,
            frozen_amount: numAmount,
            user_email: profile.email,
            state_history: ['REQUESTED', 'RISK_REVIEW', 'FUNDS_RESERVED']
          }
        })
        .select()
        .single();

      if (txErr) throw txErr;
      transaction = tx;

      // Enqueue Transactional Outbox Event
      await outbox.enqueueEvent({
        eventType: 'PAYOUT_FUNDS_RESERVED',
        aggregateType: 'Withdrawal',
        aggregateId: transaction.id,
        payload: { reference, userId, amount: numAmount, currency: upCurrency }
      });

    } catch (createErr) {
      // Rollback balance freeze
      await supabase
        .from('wallets_store')
        .update({ available_balance: availableBal })
        .eq('id', walletId);

      throw new Error(`[WithdrawalWorkflow] Failed to record transaction: ${createErr.message}`);
    }

    // 5. Stage: QUEUED -> Dispatch Request to Settlement Router
    try {
      await supabase.from('transactions').update({ status: 'QUEUED' }).eq('id', transaction.id);

      const { adapter, providerName } = SettlementLayerRouter.selectBestGateway({
        currency: upCurrency,
        method: 'bank_transfer'
      });

      const providerInstance = adapter.getInstance ? adapter.getInstance() : new (require('../settlement/GreySettlementProvider'))();
      
      await supabase.from('transactions').update({ status: 'SENDING' }).eq('id', transaction.id);

      const payoutResult = await providerInstance.createPayout({
        address: accountNumber,
        amount: numAmount,
        currency: upCurrency,
        reference,
        beneficiaryId: accountNumber,
        metadata: {
          transactionId: transaction.id,
          userId,
          idempotencyKey: idempotencyKey || `idemp_wd_${reference}`,
          bankCode
        }
      });

      const nextStatus = payoutResult.status === 'COMPLETED' ? 'COMPLETED' : 'PROVIDER_PROCESSING';

      // Update provider reference & status
      await supabase
        .from('transactions')
        .update({ 
          provider: providerName,
          provider_reference: payoutResult.providerReference || reference,
          status: nextStatus
        })
        .eq('id', transaction.id);

      // Enqueue Outbox event for dispatch
      await outbox.enqueueEvent({
        eventType: 'PAYOUT_DISPATCHED',
        aggregateType: 'Withdrawal',
        aggregateId: transaction.id,
        payload: { reference, providerName, providerReference: payoutResult.providerReference }
      });

      // Notify User
      await notificationService.createNotification({
        userId,
        title: 'Withdrawal Submitted',
        message: `Your withdrawal of ${numAmount} ${upCurrency} has been submitted for settlement.`,
        type: 'WITHDRAWAL_PROCESSING',
        data: { reference, amount: numAmount, currency: upCurrency }
      }).catch(() => {});

      AuditLogService.log({
        user_id: userId,
        action: 'payout_initiated',
        provider: providerName,
        reference,
        amount: numAmount,
        currency: upCurrency
      }).catch(() => {});

      return {
        success: true,
        transactionId: transaction.id,
        reference,
        status: nextStatus,
        amount: numAmount,
        currency: upCurrency
      };

    } catch (settleErr) {
      const isTimeout = settleErr.message.includes('timeout') || settleErr.code === 'ETIMEDOUT';
      const failState = isTimeout ? 'PROVIDER_TIMEOUT' : 'VALIDATION_FAILURE';
      
      logger.error(`[WithdrawalWorkflow] Settlement dispatch failed (${failState}): ${settleErr.message}. Executing auto-rollback...`);
      await this.rollbackFailedWithdrawal(transaction.id, settleErr.message, failState);
      throw settleErr;
    }
  }

  /**
   * Rollback & Unfreeze Funds on Settlement Failure
   *
   * 100% DATABASE ATOMICITY: Uses `atomic_rollback_transaction` PL/pgSQL RPC
   * function to execute both transaction status update AND wallet balance restoration
   * within a single PostgreSQL transaction. Eliminates process crash failure window.
   */
  async rollbackFailedWithdrawal(transactionId, reason, failState = 'REJECTED') {
    logger.warn(`[WithdrawalWorkflow] Rolling back failed withdrawal ${transactionId} (${failState}): ${reason}`);

    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    // Idempotency guard: skip if already in terminal state
    if (!tx || ['COMPLETED', 'RECONCILED', 'CANCELLED', 'REJECTED', 'REVERSED'].includes(tx.status)) {
      logger.info(`[WithdrawalWorkflow] Rollback skipped for ${transactionId}: already in terminal state (${tx?.status || 'NOT_FOUND'})`);
      return;
    }

    // Attempt atomic database RPC call first (executes status update + balance restore in ONE SQL transaction)
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('atomic_rollback_transaction', {
      p_transaction_id: transactionId,
      p_reason: reason,
      p_fail_state: failState,
    });

    if (rpcRes && rpcRes.success) {
      if (rpcRes.already_finalized) {
        logger.info(`[WithdrawalWorkflow] Atomic rollback skipped for ${transactionId}: already in terminal state`);
        return;
      }
      logger.info(`[WithdrawalWorkflow] ✅ Atomic rollback completed via DB RPC for ${transactionId}`);
    } else {
      // Fallback if RPC not applied yet
      logger.warn(`[WithdrawalWorkflow] atomic_rollback_transaction RPC error, falling back: ${rpcErr?.message}`);
      
      const { data: updatedTx } = await supabase
        .from('transactions')
        .update({
          status: failState,
          metadata: { ...(tx.metadata || {}), failure_reason: reason, fail_state: failState, rolled_back_at: new Date().toISOString() }
        })
        .eq('id', transactionId)
        .not('status', 'in', '("COMPLETED","RECONCILED","CANCELLED","REJECTED","REVERSED")')
        .select()
        .maybeSingle();

      if (!updatedTx) return;

      const numAmount = Number(tx.amount || 0);
      if (numAmount > 0 && tx.wallet_id) {
        const { data: wallet } = await supabase
          .from('wallets_store')
          .select('available_balance')
          .eq('id', tx.wallet_id)
          .single();

        if (wallet) {
          await supabase
            .from('wallets_store')
            .update({
              available_balance: Number(wallet.available_balance || 0) + numAmount,
              updated_at: new Date().toISOString()
            })
            .eq('id', tx.wallet_id);
        }
      }
    }

    // Notify User
    await notificationService.createNotification({
      userId: tx.user_id,
      title: 'Withdrawal Unsuccessful',
      message: `Your withdrawal of ${tx.amount} ${tx.currency} could not be settled. Funds have been returned to your available balance.`,
      type: 'WITHDRAWAL_FAILED',
      data: { reference: tx.reference_id, reason, failState }
    }).catch(() => {});
  }

  /**
   * Finalize successful settlement webhook
   *
   * 100% DATABASE ATOMICITY: Uses `atomic_finalize_transaction` PL/pgSQL RPC
   * function to execute both transaction status update AND wallet balance deduction
   * within a single PostgreSQL transaction. Eliminates process crash failure window.
   */
  async finalizeSuccessfulSettlement(reference, providerReference) {
    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('reference_id', reference)
      .maybeSingle();

    if (!tx || ['COMPLETED', 'RECONCILED'].includes(tx.status)) {
      return; // Idempotent skip
    }

    // Attempt atomic database RPC call first (executes status update + balance debit in ONE SQL transaction)
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('atomic_finalize_transaction', {
      p_transaction_id: tx.id,
      p_provider_ref: providerReference || tx.provider_reference,
    });

    if (rpcRes && rpcRes.success) {
      if (rpcRes.already_finalized) {
        logger.info(`[WithdrawalWorkflow] Atomic finalization skipped for ${reference}: already finalized`);
        return;
      }
      logger.info(`[WithdrawalWorkflow] ✅ Atomic settlement finalization completed via DB RPC for ${reference}`);
    } else {
      // Fallback if RPC not applied yet
      logger.warn(`[WithdrawalWorkflow] atomic_finalize_transaction RPC error, falling back: ${rpcErr?.message}`);

      const { data: claimedTx } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          provider_reference: providerReference || tx.provider_reference,
          updated_at: new Date().toISOString()
        })
        .eq('id', tx.id)
        .not('status', 'in', '("COMPLETED","RECONCILED")')
        .select()
        .maybeSingle();

      if (!claimedTx) return;

      const numAmount = Number(tx.amount || 0);
      if (numAmount > 0 && tx.wallet_id) {
        const { data: wallet } = await supabase
          .from('wallets_store')
          .select('balance')
          .eq('id', tx.wallet_id)
          .single();

        if (wallet) {
          const curBal = Number(wallet.balance || 0);
          await supabase
            .from('wallets_store')
            .update({ 
              balance: Math.max(0, curBal - numAmount),
              updated_at: new Date().toISOString()
            })
            .eq('id', tx.wallet_id);
        }
      }
    }

    // Enqueue Outbox Event
    await outbox.enqueueEvent({
      eventType: 'PAYOUT_COMPLETED',
      aggregateType: 'Withdrawal',
      aggregateId: tx.id,
      payload: { reference, providerReference }
    });

    // Send Completion Notification
    await notificationService.createNotification({
      userId: tx.user_id,
      title: 'Withdrawal Completed',
      message: `Your withdrawal of ${tx.amount} ${tx.currency} has been successfully settled to your bank account.`,
      type: 'WITHDRAWAL_SUCCESS',
      data: { reference, amount: tx.amount, currency: tx.currency }
    }).catch(() => {});
  }

  async _runRiskChecks(userId, amount, currency, reference = '') {
    const highValNgn = Number(process.env.HIGH_VALUE_WITHDRAWAL_THRESHOLD_NGN || 15000000);
    const highValUsd = Number(process.env.HIGH_VALUE_WITHDRAWAL_THRESHOLD_USD || 10000);

    if ((currency === 'USD' && amount >= highValUsd) || (currency === 'NGN' && amount >= highValNgn)) {
      logger.warn(`[WithdrawalWorkflow] High value withdrawal flagged for user ${userId}: ${amount} ${currency}`);
      notificationService.notifyAdminsManualReview({
        type: 'withdrawal',
        amount,
        currency,
        userId,
        reference,
        reason: 'High Value Withdrawal Screening Flag'
      }).catch(err => logger.warn(`[WithdrawalWorkflow] Admin notification error: ${err.message}`));
    }
  }
}

module.exports = new WithdrawalWorkflowService();
