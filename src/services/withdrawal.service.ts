// ============================================================================
// Withdrawal Service
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WalletService } from './wallet.service';
import type { ReservationService } from './reservation.service';
import type { RiskEngineService } from './risk-engine.service';
import type { EventBus } from '@/lib/events/event-bus';
import type { WithdrawalRequest, WithdrawalParams, RequestContext } from '@/types';
import {
  TransactionCategory,
  ReservationType,
  WithdrawalStatus,
} from '@/types';
import {
  withdrawalReference,
  reservationReference,
} from '@/lib/utils/reference';
import { ValidationError, RiskBlockedError, ForbiddenError } from '@/lib/utils/errors';

export class WithdrawalService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly walletService: WalletService,
    private readonly reservationService: ReservationService,
    private readonly riskEngine: RiskEngineService,
    private readonly eventBus: EventBus,
    private readonly autoApproveThreshold: number = 5_000_000, // ₦50,000 in kobo
    private readonly withdrawalFee: number = 5_000, // ₦50 in kobo
  ) {}

  /**
   * Create a new withdrawal request.
   * Flow: validate → risk assess → reserve funds → create request → auto-approve if below threshold
   */
  async createWithdrawal(
    ctx: RequestContext,
    params: WithdrawalParams,
  ): Promise<WithdrawalRequest> {
    if (params.amount <= 0) throw new ValidationError('Amount must be positive');

    const totalAmount = params.amount + this.withdrawalFee;

    // 1. Get wallet
    const wallet = await this.walletService.getWallet(ctx.userId, params.currency);

    if (wallet.available_balance < totalAmount) {
      throw new ValidationError(
        `Insufficient balance. Available: ${wallet.available_balance}, Required: ${totalAmount} (includes ₦${this.withdrawalFee / 100} fee)`,
      );
    }

    // 2. Risk assessment
    const risk = await this.riskEngine.assessWithdrawal(
      ctx.userId,
      params.amount,
      params.currency,
    );

    if (risk.decision === 'block') {
      throw new RiskBlockedError(risk.reasons);
    }

    // 3. Reserve funds (available → reserved)
    const ref = withdrawalReference();
    const resRef = reservationReference();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const reservationId = await this.reservationService.reserve({
      walletId: wallet.id,
      amount: totalAmount,
      currency: params.currency,
      reference: resRef,
      type: ReservationType.WITHDRAWAL_HOLD,
      expiresAt,
    });

    // 4. Determine initial status
    const shouldAutoApprove =
      params.amount <= this.autoApproveThreshold && risk.decision === 'allow';

    const status = shouldAutoApprove
      ? WithdrawalStatus.APPROVED
      : WithdrawalStatus.PENDING;

    // 5. Create withdrawal request
    const { data, error } = await this.supabase
      .from('withdrawal_requests')
      .insert({
        user_id: ctx.userId,
        wallet_id: wallet.id,
        amount: params.amount,
        fee: this.withdrawalFee,
        currency: params.currency,
        status,
        destination_type: params.destinationType,
        destination_details: params.destinationDetails,
        reservation_id: reservationId,
        risk_score: risk.score,
        approved_by: shouldAutoApprove ? ctx.userId : null,
        approved_at: shouldAutoApprove ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create withdrawal: ${error.message}`);

    const withdrawal = data as WithdrawalRequest;

    // 6. Emit events
    this.eventBus.emit('withdrawal.requested', {
      userId: ctx.userId,
      walletId: wallet.id,
      amount: params.amount,
      currency: params.currency,
      reference: ref,
      requestId: withdrawal.id,
      destinationType: params.destinationType,
      traceId: ctx.traceId,
    });

    if (shouldAutoApprove) {
      this.eventBus.emit('withdrawal.approved', {
        userId: ctx.userId,
        walletId: wallet.id,
        amount: params.amount,
        currency: params.currency,
        reference: ref,
        requestId: withdrawal.id,
        destinationType: params.destinationType,
        traceId: ctx.traceId,
      });
    }

    return withdrawal;
  }

  /** Get user's withdrawal requests */
  async getWithdrawals(userId: string, limit = 20): Promise<WithdrawalRequest[]> {
    const { data, error } = await this.supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch withdrawals: ${error.message}`);
    return (data ?? []) as WithdrawalRequest[];
  }

  /** Get a single withdrawal by ID (with ownership check) */
  async getWithdrawal(userId: string, withdrawalId: string): Promise<WithdrawalRequest> {
    const { data, error } = await this.supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', withdrawalId)
      .single();

    if (error || !data) throw new ValidationError('Withdrawal not found');
    if ((data as WithdrawalRequest).user_id !== userId) throw new ForbiddenError();
    return data as WithdrawalRequest;
  }

  /** Admin: Approve a pending withdrawal */
  async approve(withdrawalId: string, adminId: string): Promise<void> {
    const { error } = await this.supabase
      .from('withdrawal_requests')
      .update({
        status: WithdrawalStatus.APPROVED,
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', withdrawalId)
      .eq('status', WithdrawalStatus.PENDING);

    if (error) throw new Error(`Failed to approve withdrawal: ${error.message}`);
  }

  /** Admin: Reject a pending withdrawal (releases reserved funds) */
  async reject(
    withdrawalId: string,
    adminId: string,
    reason: string,
  ): Promise<void> {
    const { data } = await this.supabase
      .from('withdrawal_requests')
      .select('reservation_id')
      .eq('id', withdrawalId)
      .eq('status', WithdrawalStatus.PENDING)
      .single();

    if (!data) throw new ValidationError('Withdrawal not found or not pending');

    // Release the reserved funds
    if (data.reservation_id) {
      await this.reservationService.release(data.reservation_id);
    }

    await this.supabase
      .from('withdrawal_requests')
      .update({
        status: WithdrawalStatus.REJECTED,
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', withdrawalId);
  }
}
