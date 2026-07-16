// ============================================================================
// Wallet Gateway — Single entry point for all wallet operations
// ============================================================================
// Orchestrates wallet + ledger + reservation + feature flags into a
// unified API. API routes should call the Gateway, never services directly
// for multi-step operations.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { WalletService } from '@/services/wallet.service';
import { LedgerService } from '@/services/ledger.service';
import { ReservationService } from '@/services/reservation.service';
import { FeatureFlagService } from '@/services/feature-flag.service';
import type {
  Wallet,
  LedgerEntry,
  WalletReservation,
  LedgerQueryFilters,
  CreditWalletParams,
  DebitWalletParams,
  ReserveWalletParams,
  ReconciliationResult,
  RequestContext,
} from '@/types';
import { WalletNotFoundError, ForbiddenError } from '@/lib/utils/errors';

export interface WalletDashboard {
  wallet: Wallet;
  recentTransactions: LedgerEntry[];
  activeReservations: WalletReservation[];
}

export class WalletGateway {
  private readonly wallet: WalletService;
  private readonly ledger: LedgerService;
  private readonly reservation: ReservationService;
  private readonly featureFlags: FeatureFlagService;

  constructor(supabase: SupabaseClient, featureFlags: FeatureFlagService) {
    this.wallet = new WalletService(supabase);
    this.ledger = new LedgerService(supabase);
    this.reservation = new ReservationService(supabase);
    this.featureFlags = featureFlags;
  }

  /**
   * Returns a full wallet dashboard: wallet + recent transactions + active reservations.
   * Verifies ownership before returning data.
   */
  async getWalletDashboard(
    ctx: RequestContext,
    walletId: string,
  ): Promise<WalletDashboard> {
    const wallet = await this.wallet.getWalletById(walletId);

    if (wallet.user_id !== ctx.userId) {
      throw new ForbiddenError('You do not own this wallet');
    }

    const [txResult, reservations] = await Promise.all([
      this.ledger.getEntries({ walletId, limit: 10 }),
      this.reservation.getActive(walletId),
    ]);

    return {
      wallet,
      recentTransactions: txResult.entries,
      activeReservations: reservations,
    };
  }

  /**
   * List all wallets for a user.
   */
  async listWallets(userId: string): Promise<Wallet[]> {
    return this.wallet.getWallets(userId);
  }

  /**
   * Create a new wallet with feature flag validation.
   */
  async createWallet(
    ctx: RequestContext,
    currency: string,
  ): Promise<Wallet> {
    // Check currency-specific feature flag (e.g., 'usd_wallet', 'btc_wallet')
    const flagKey = `${currency.toLowerCase()}_wallet`;
    if (currency !== 'NGN') {
      await this.featureFlags.assertEnabled(flagKey, ctx.userTier, ctx.userId);
    }

    return this.wallet.ensureWallet(ctx.userId, currency);
  }

  /**
   * Credit a wallet. Used by Transaction Engine after deposit verification.
   */
  async credit(params: CreditWalletParams): Promise<string> {
    return this.wallet.creditBalance(params);
  }

  /**
   * Debit a wallet. Used by withdrawal processing.
   */
  async debit(params: DebitWalletParams): Promise<string> {
    return this.wallet.debitBalance(params);
  }

  /**
   * Reserve funds in a wallet.
   */
  async reserve(params: ReserveWalletParams): Promise<string> {
    return this.reservation.reserve(params);
  }

  /**
   * Capture a reservation (reserved → locked).
   */
  async captureReservation(reservationId: string): Promise<void> {
    return this.reservation.capture(reservationId);
  }

  /**
   * Release a reservation (reserved → available).
   */
  async releaseReservation(reservationId: string): Promise<void> {
    return this.reservation.release(reservationId);
  }

  /**
   * Get transaction history with cursor pagination.
   */
  async getTransactions(
    ctx: RequestContext,
    filters: LedgerQueryFilters,
  ): Promise<{ entries: LedgerEntry[]; cursor: string | null; hasMore: boolean }> {
    // If walletId is specified, verify ownership
    if (filters.walletId) {
      const wallet = await this.wallet.getWalletById(filters.walletId);
      if (wallet.user_id !== ctx.userId) {
        throw new ForbiddenError('You do not own this wallet');
      }
    }

    return this.ledger.getEntries(filters);
  }

  /**
   * Reconcile a specific wallet.
   */
  async reconcile(walletId: string): Promise<ReconciliationResult> {
    return this.wallet.reconcile(walletId);
  }

  /**
   * Reconcile all wallets and return results.
   */
  async reconcileAll(): Promise<ReconciliationResult[]> {
    return this.ledger.reconcileAll();
  }
}
