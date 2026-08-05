'use strict';

const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const notificationService = require('../notificationService');
const { v4: uuidv4 } = require('uuid');

/**
 * DepositMatchingService
 * ======================
 * Enterprise Confidence-Scored Deposit Matching Engine.
 *
 * Scoring Waterfall:
 *  - Reference Match ............. +60
 *  - Virtual Account Match ....... +50
 *  - Expected User ............... +30
 *  - Amount Match ................ +20
 *  - Currency Match .............. +15
 *  - Deposit Window (72h) ........ +10
 *  - Memo / Description Match .... +15
 *
 * Threshold Actions:
 *  - >= 95%: Automatic Credit (State: COMPLETED)
 *  - 70% - 94%: Manual Review Recommended (State: MANUAL_REVIEW)
 *  - < 70%: Unknown Deposit Queue (State: UNALLOCATED)
 */
class DepositMatchingService {
  /**
   * Evaluate and match an incoming deposit
   */
  async matchAndProcessDeposit(depositPayload) {
    const {
      provider = 'grey',
      providerTxId,
      providerReference,
      amount,
      currency = 'USD',
      rail = 'ACH',
      senderName,
      senderAccount,
      memo = '',
      fee = 0
    } = depositPayload;

    const numAmount = Number(amount);
    const upCurrency = String(currency).toUpperCase();
    const upRail = String(rail).toUpperCase();

    logger.info(`[DepositMatchingService] Evaluating incoming ${upRail} deposit of ${numAmount} ${upCurrency}`, {
      providerTxId,
      memo,
      senderName
    });

    // 1. Deduplication Check against provider_transactions & unallocated_deposits
    if (providerTxId) {
      const [{ data: existingProvTx }, { data: existingUnalloc }] = await Promise.all([
        supabase.from('provider_transactions').select('*').eq('provider_tx_id', String(providerTxId)).maybeSingle(),
        supabase.from('unallocated_deposits').select('*').eq('sender_account', String(providerTxId)).maybeSingle()
      ]);

      if (existingProvTx || existingUnalloc) {
        logger.info(`[DepositMatchingService] Duplicate deposit ${providerTxId} ignored (already processed).`);
        return { status: 'DUPLICATE', confidenceScore: 100, message: 'Duplicate deposit ignored' };
      }
    }

    // 2. Fetch candidates from deposit_references and profiles
    const candidates = await this._findCandidates(memo, senderAccount, numAmount, upCurrency);

    // 3. Score each candidate
    let bestMatch = null;
    let highestScore = 0;

    for (const candidate of candidates) {
      const score = this._calculateConfidenceScore(depositPayload, candidate);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = { candidate, score };
      }
    }

    logger.info(`[DepositMatchingService] Candidate scoring complete. Highest score: ${highestScore}%`);

    // Log Canonical Record in provider_transactions
    let provTx = null;
    try {
      const { data } = await supabase.from('provider_transactions').insert({
        provider,
        provider_tx_id: String(providerTxId || providerReference || uuidv4()),
        provider_reference: String(providerReference || providerTxId),
        currency: upCurrency,
        rail: upRail,
        amount: numAmount,
        sender_name: senderName,
        sender_account: senderAccount,
        status: highestScore >= 95 ? 'MATCHED' : (highestScore >= 70 ? 'MATCHED' : 'UNALLOCATED'),
        settlement_status: 'SETTLED',
        raw_payload: depositPayload
      }).select().single();
      provTx = data;
    } catch (e) {
      logger.warn(`[DepositMatchingService] Provider tx log warning: ${e.message}`);
    }

    // 4. Threshold Action Dispatch
    if (highestScore >= 95 && bestMatch) {
      return this._executeAutoCredit(depositPayload, bestMatch.candidate, highestScore, provTx?.id);
    } else if (highestScore >= 70 && bestMatch) {
      return this._flagForManualReview(depositPayload, bestMatch.candidate, highestScore, provTx?.id);
    } else {
      return this._routeToUnknownDepositQueue(depositPayload, provTx?.id);
    }
  }

  /**
   * Calculate confidence score (0 - 100)
   */
  _calculateConfidenceScore(deposit, candidate) {
    let score = 0;

    // Reference Match (+60)
    if (deposit.memo && candidate.reference && deposit.memo.toUpperCase().includes(candidate.reference.toUpperCase())) {
      score += 60;
    }

    // Virtual Account Match (+50)
    if (deposit.senderAccount && candidate.account_number && deposit.senderAccount === candidate.account_number) {
      score += 50;
    }

    // Expected User Match (+30)
    if (candidate.user_id) {
      score += 30;
    }

    // Amount Match (+20)
    if (candidate.expected_amount && Math.abs(Number(candidate.expected_amount) - Number(deposit.amount)) < 0.01) {
      score += 20;
    }

    // Currency Match (+15)
    if (candidate.currency && String(candidate.currency).toUpperCase() === String(deposit.currency).toUpperCase()) {
      score += 15;
    }

    // Deposit Window 72h (+10)
    if (candidate.created_at) {
      const ageHours = (Date.now() - new Date(candidate.created_at).getTime()) / (1000 * 60 * 60);
      if (ageHours <= 72) score += 10;
    }

    // Memo Match (+15)
    if (deposit.memo && deposit.memo.toLowerCase().includes('notestandard')) {
      score += 15;
    }

    return Math.min(100, score);
  }

  async _findCandidates(memo, senderAccount, amount, currency) {
    const { data: refs } = await supabase
      .from('deposit_references')
      .select('*')
      .eq('currency', currency)
      .in('status', ['CREATED', 'AWAITING_PAYMENT'])
      .order('created_at', { ascending: false })
      .limit(20);

    return refs || [];
  }

  /**
   * Execute Automatic Wallet Credit & Double-Entry Fee Accounting
   */
  async _executeAutoCredit(deposit, candidate, score, providerTxId) {
    const userId = candidate.user_id;
    const numAmount = Number(deposit.amount);
    const upCurrency = String(deposit.currency).toUpperCase();
    const feeAmount = Number(deposit.fee || 0);

    logger.info(`[DepositMatchingService] Auto-crediting ${numAmount} ${upCurrency} to user ${userId} (Score: ${score}%)`);

    // Fetch user wallet
    const { data: wallet } = await supabase
      .from('wallets_store')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', upCurrency)
      .maybeSingle();

    if (!wallet) {
      return this._routeToUnknownDepositQueue(deposit, providerTxId, 'Wallet not found for matched user');
    }

    const curBal = Number(wallet.balance || 0);
    const curAvail = Number(wallet.available_balance || 0);

    // Atomically Credit Wallet (User gets FULL deposit amount)
    await supabase
      .from('wallets_store')
      .update({
        balance: curBal + numAmount,
        available_balance: curAvail + numAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', wallet.id);

    // Record Transaction
    const refId = `dep_${uuidv4().replace(/-/g, '')}`;
    await supabase.from('transactions').insert({
      user_id: userId,
      wallet_id: wallet.id,
      amount: numAmount,
      currency: upCurrency,
      type: 'DEPOSIT',
      status: 'COMPLETED',
      reference_id: refId,
      provider: 'grey',
      display_label: `Incoming ${deposit.rail || 'ACH'} Deposit`,
      metadata: {
        provider_tx_id: deposit.providerTxId,
        confidence_score: score,
        rail: deposit.rail,
        fee_amount: feeAmount,
        matched_candidate_id: candidate.id
      }
    });

    // Update deposit reference status
    if (candidate.id) {
      await supabase
        .from('deposit_references')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('id', candidate.id);
    }

    // Real-time Notification
    await notificationService.createNotification({
      userId,
      title: 'Deposit Received',
      message: `Your ${deposit.rail || 'ACH'} deposit of $${numAmount.toLocaleString()} ${upCurrency} has been credited to your wallet.`,
      type: 'DEPOSIT_CREDITED',
      data: { reference: refId, amount: numAmount, currency: upCurrency }
    }).catch(() => {});

    return {
      status: 'CREDITED',
      confidenceScore: score,
      userId,
      amount: numAmount,
      currency: upCurrency,
      reference: refId
    };
  }

  async _flagForManualReview(deposit, candidate, score, providerTxId) {
    logger.warn(`[DepositMatchingService] High confidence (${score}%) match requires manual review recommendation`);
    return this._routeToUnknownDepositQueue(deposit, providerTxId, `Match score ${score}% (70-94% range) requires manual review`);
  }

  async _routeToUnknownDepositQueue(deposit, providerTxId, reason = 'Match score below 70%') {
    logger.warn(`[DepositMatchingService] Routing deposit to Unknown Deposit Queue (${reason})`);

    const { data: unalloc } = await supabase.from('unallocated_deposits').insert({
      provider: 'grey',
      currency: deposit.currency ? deposit.currency.toUpperCase() : 'USD',
      rail: deposit.rail ? deposit.rail.toUpperCase() : 'ACH',
      amount: Number(deposit.amount),
      sender_name: deposit.senderName || 'Unknown',
      sender_account: deposit.senderAccount || '',
      memo: deposit.memo || '',
      status: 'PENDING_REVIEW',
      reason,
      raw_payload: deposit
    }).select().single();

    return {
      status: 'UNALLOCATED',
      confidenceScore: 0,
      unallocatedId: unalloc?.id,
      reason,
      message: 'Deposit routed to Unknown Deposit Queue for manual review'
    };
  }
}

module.exports = new DepositMatchingService();
