// ============================================================================
// Transaction Engine — Central coordinator for all payment flows
// ============================================================================
// Business logic lives HERE, not in provider adapters.
// Every deposit, withdrawal, and refund flows through this engine.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WalletService } from './wallet.service';
import type { RiskEngineService } from './risk-engine.service';
import type { ProviderRegistry } from '@/lib/providers/provider-registry';
import type { ProviderHealthMonitor } from '@/lib/providers/health-monitor';
import type { EventBus } from '@/lib/events/event-bus';
import type { NormalizedWebhookEvent, TransactionInitResult } from '@/lib/providers/interfaces/types';
import type { RequestContext, DepositParams } from '@/types';
import { TransactionCategory, ProviderTransactionStatus } from '@/types';
import { depositReference } from '@/lib/utils/reference';
import { RiskBlockedError, PaymentVerificationError, DuplicateTransactionError } from '@/lib/utils/errors';

export interface DepositResult {
  checkoutUrl: string;
  reference: string;
  accessCode: string;
}

export class TransactionEngineService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly walletService: WalletService,
    private readonly riskEngine: RiskEngineService,
    private readonly providerRegistry: ProviderRegistry,
    private readonly healthMonitor: ProviderHealthMonitor,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Initialize a deposit: risk check → provider selection → init payment → pending records
   */
  async initializeDeposit(
    ctx: RequestContext,
    params: DepositParams,
  ): Promise<DepositResult> {
    const reference = depositReference();

    // 1. Risk assessment
    const risk = await this.riskEngine.assessDeposit(
      ctx.userId,
      params.amount,
      params.currency,
    );

    if (risk.decision === 'block') {
      throw new RiskBlockedError(risk.reasons);
    }

    // 2. Ensure wallet exists
    const wallet = await this.walletService.ensureWallet(ctx.userId, params.currency);

    // 3. Select payment provider
    const provider = await this.providerRegistry.getPaymentProvider(
      params.currency,
      params.method,
    );

    // 4. Get user email from Supabase auth
    const { data: userData } = await this.supabase.auth.admin.getUserById(ctx.userId);
    const email = userData?.user?.email || 'user@notestandard.com';

    // 5. Initialize transaction with provider
    let initResult: TransactionInitResult;
    try {
      initResult = await provider.initializeTransaction({
        amount: params.amount,
        currency: params.currency,
        email,
        reference,
        callbackUrl: params.callbackUrl,
        metadata: {
          userId: ctx.userId,
          walletId: wallet.id,
          traceId: ctx.traceId,
          ...params.metadata,
        },
      });

      await this.healthMonitor.recordSuccess(provider.name, 0);
    } catch (err) {
      await this.healthMonitor.recordFailure(
        provider.name,
        err instanceof Error ? err : new Error(String(err)),
      );
      throw err;
    }

    // 6. Create provider transaction record
    await this.supabase.from('provider_transactions').insert({
      user_id: ctx.userId,
      provider: provider.name,
      internal_reference: reference,
      type: 'deposit',
      amount: params.amount,
      currency: params.currency,
      status: ProviderTransactionStatus.PENDING,
      metadata: { traceId: ctx.traceId },
    });

    // 7. Emit event
    this.eventBus.emit('deposit.initialized', {
      userId: ctx.userId,
      walletId: wallet.id,
      amount: params.amount,
      currency: params.currency,
      reference,
      provider: provider.name,
      traceId: ctx.traceId,
    });

    return {
      checkoutUrl: initResult.authorizationUrl,
      reference,
      accessCode: initResult.accessCode,
    };
  }

  /**
   * Complete a deposit after successful payment verification
   */
  async completeDeposit(reference: string, traceId: string): Promise<void> {
    // 1. Find the provider transaction
    const { data: ptx } = await this.supabase
      .from('provider_transactions')
      .select('*')
      .eq('internal_reference', reference)
      .single();

    if (!ptx) throw new PaymentVerificationError(reference, 'Transaction not found');
    if (ptx.status === ProviderTransactionStatus.SUCCESS) {
      throw new DuplicateTransactionError(reference);
    }

    // 2. Verify with provider
    const provider = await this.providerRegistry.getPaymentProvider(ptx.currency);
    let verification;
    try {
      verification = await provider.verifyTransaction(reference);
      await this.healthMonitor.recordSuccess(provider.name, 0);
    } catch (err) {
      await this.healthMonitor.recordFailure(
        provider.name,
        err instanceof Error ? err : new Error(String(err)),
      );
      throw err;
    }

    if (!verification.verified) {
      // Update transaction as failed
      await this.supabase
        .from('provider_transactions')
        .update({
          status: ProviderTransactionStatus.FAILED,
          provider_response: verification.rawResponse,
          updated_at: new Date().toISOString(),
        })
        .eq('internal_reference', reference);

      this.eventBus.emit('deposit.failed', {
        userId: ptx.user_id,
        walletId: '',
        amount: ptx.amount,
        currency: ptx.currency,
        reference,
        provider: ptx.provider,
        traceId,
      });

      throw new PaymentVerificationError(reference, verification.providerStatus);
    }

    // 3. Get user's wallet
    const wallet = await this.walletService.ensureWallet(ptx.user_id, ptx.currency);

    // 4. Credit wallet (atomic with ledger entry)
    const ledgerEntryId = await this.walletService.creditBalance({
      walletId: wallet.id,
      amount: verification.amount,
      currency: verification.currency,
      reference,
      category: TransactionCategory.DEPOSIT,
      description: `Deposit via ${ptx.provider} (${verification.channel})`,
      provider: ptx.provider,
      providerReference: verification.providerReference,
      metadata: { channel: verification.channel, traceId },
    });

    // 5. Update provider transaction
    await this.supabase
      .from('provider_transactions')
      .update({
        status: ProviderTransactionStatus.SUCCESS,
        provider_reference: verification.providerReference,
        channel: verification.channel,
        provider_fees: verification.fees,
        provider_response: verification.rawResponse,
        paid_at: verification.paidAt,
        ledger_entry_id: ledgerEntryId,
        updated_at: new Date().toISOString(),
      })
      .eq('internal_reference', reference);

    // 6. Emit events
    this.eventBus.emit('deposit.completed', {
      userId: ptx.user_id,
      walletId: wallet.id,
      amount: verification.amount,
      currency: verification.currency,
      reference,
      provider: ptx.provider,
      channel: verification.channel,
      traceId,
    });

    this.eventBus.emit('wallet.credited', {
      userId: ptx.user_id,
      walletId: wallet.id,
      amount: verification.amount,
      currency: verification.currency,
      reference,
      type: 'credit',
      category: TransactionCategory.DEPOSIT,
      balanceAfter: wallet.balance + verification.amount,
      traceId,
    });
  }

  /**
   * Process a normalized webhook event from any provider
   */
  async processWebhookEvent(event: NormalizedWebhookEvent, traceId: string): Promise<void> {
    switch (event.eventType) {
      case 'charge.success':
        if (event.reference) {
          await this.completeDeposit(event.reference, traceId);
        }
        break;

      case 'charge.failed':
        if (event.reference) {
          await this.supabase
            .from('provider_transactions')
            .update({
              status: ProviderTransactionStatus.FAILED,
              provider_reference: event.providerReference,
              updated_at: new Date().toISOString(),
            })
            .eq('internal_reference', event.reference);
        }
        break;

      case 'transfer.success':
      case 'transfer.failed':
      case 'transfer.reversed':
        // Handled by withdrawal flow
        console.log(`[TxEngine] Transfer event: ${event.eventType} for ${event.reference}`);
        break;

      default:
        console.log(`[TxEngine] Unhandled webhook event: ${event.eventType}`);
    }
  }
}
