// ============================================================================
// WalletService — Core wallet operations
// ============================================================================
// All wallet mutations go through atomic PostgreSQL RPC functions.
// This service uses the Supabase service-role client to bypass RLS.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Wallet,
  CreditWalletParams,
  DebitWalletParams,
  ReconciliationResult,
} from '@/types';
import {
  WalletNotFoundError,
  CurrencyNotSupportedError,
} from '@/lib/utils/errors';

export class WalletService {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  /**
   * Creates a new wallet for the given user in the specified currency.
   *
   * @throws {CurrencyNotSupportedError} if the currency is not active
   */
  async createWallet(userId: string, currency: string): Promise<Wallet> {
    const upperCurrency = currency.toUpperCase();

    // Verify currency is supported and active
    const { data: currencyRow, error: currencyError } = await this.supabase
      .from('supported_currencies')
      .select('code, is_active')
      .eq('code', upperCurrency)
      .maybeSingle();

    if (currencyError) {
      throw new Error(`Failed to check currency: ${currencyError.message}`);
    }

    if (!currencyRow || !currencyRow.is_active) {
      throw new CurrencyNotSupportedError(upperCurrency);
    }

    const { data, error: insertError } = await this.supabase
      .from('wallets')
      .insert({
        user_id: userId,
        currency: upperCurrency,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create wallet: ${insertError.message}`);
    }

    return data as Wallet;
  }

  /**
   * Returns the user's wallet for the specified currency.
   * Creates one if it does not exist yet.
   */
  async ensureWallet(userId: string, currency: string): Promise<Wallet> {
    const upperCurrency = currency.toUpperCase();

    const { data: existing } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', upperCurrency)
      .maybeSingle();

    if (existing) {
      return existing as Wallet;
    }

    return this.createWallet(userId, upperCurrency);
  }

  /**
   * Retrieves a wallet by user ID and currency.
   *
   * @throws {WalletNotFoundError} if no matching wallet exists
   */
  async getWallet(userId: string, currency: string): Promise<Wallet> {
    const upperCurrency = currency.toUpperCase();

    const { data, error: queryError } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', upperCurrency)
      .maybeSingle();

    if (queryError) {
      throw new Error(`Failed to fetch wallet: ${queryError.message}`);
    }

    if (!data) {
      throw new WalletNotFoundError(`${userId}/${upperCurrency}`);
    }

    return data as Wallet;
  }

  /**
   * Retrieves a wallet by its primary key.
   *
   * @throws {WalletNotFoundError} if the wallet does not exist
   */
  async getWalletById(walletId: string): Promise<Wallet> {
    const { data, error: queryError } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .maybeSingle();

    if (queryError) {
      throw new Error(`Failed to fetch wallet: ${queryError.message}`);
    }

    if (!data) {
      throw new WalletNotFoundError(walletId);
    }

    return data as Wallet;
  }

  /**
   * Returns all wallets belonging to a user.
   */
  async getWallets(userId: string): Promise<Wallet[]> {
    const { data, error: queryError } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (queryError) {
      throw new Error(`Failed to fetch wallets: ${queryError.message}`);
    }

    return (data ?? []) as Wallet[];
  }

  // -------------------------------------------------------------------------
  // Balance Mutations (atomic RPC)
  // -------------------------------------------------------------------------

  /**
   * Credits a wallet via the `credit_wallet` PostgreSQL function.
   *
   * @returns The newly created ledger entry ID
   */
  async creditBalance(params: CreditWalletParams): Promise<string> {
    const { data, error: rpcError } = await this.supabase.rpc('credit_wallet', {
      p_wallet_id: params.walletId,
      p_amount: params.amount,
      p_currency: params.currency,
      p_reference: params.reference,
      p_category: params.category,
      p_description: params.description ?? null,
      p_provider: params.provider ?? null,
      p_provider_reference: params.providerReference ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (rpcError) {
      throw new Error(`credit_wallet RPC failed: ${rpcError.message}`);
    }

    return data as string;
  }

  /**
   * Debits a wallet via the `debit_wallet` PostgreSQL function.
   *
   * @returns The newly created ledger entry ID
   */
  async debitBalance(params: DebitWalletParams): Promise<string> {
    const { data, error: rpcError } = await this.supabase.rpc('debit_wallet', {
      p_wallet_id: params.walletId,
      p_amount: params.amount,
      p_currency: params.currency,
      p_reference: params.reference,
      p_category: params.category,
      p_description: params.description ?? null,
      p_provider: params.provider ?? null,
      p_provider_reference: params.providerReference ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (rpcError) {
      throw new Error(`debit_wallet RPC failed: ${rpcError.message}`);
    }

    return data as string;
  }

  // -------------------------------------------------------------------------
  // Lock / Unlock (atomic RPC)
  // -------------------------------------------------------------------------

  /**
   * Locks a specified amount in the wallet, reducing available_balance.
   */
  async lockFunds(walletId: string, amount: number): Promise<void> {
    const { error: rpcError } = await this.supabase.rpc('lock_wallet_funds', {
      p_wallet_id: walletId,
      p_amount: amount,
    });

    if (rpcError) {
      throw new Error(`lock_wallet_funds RPC failed: ${rpcError.message}`);
    }
  }

  /**
   * Unlocks a previously locked amount, restoring available_balance.
   */
  async unlockFunds(walletId: string, amount: number): Promise<void> {
    const { error: rpcError } = await this.supabase.rpc('unlock_wallet_funds', {
      p_wallet_id: walletId,
      p_amount: amount,
    });

    if (rpcError) {
      throw new Error(`unlock_wallet_funds RPC failed: ${rpcError.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------

  /**
   * Reconciles a wallet's stored balance against its computed ledger sum.
   *
   * @returns The reconciliation result with consistency flag
   */
  async reconcile(walletId: string): Promise<ReconciliationResult> {
    const { data, error: rpcError } = await this.supabase.rpc(
      'reconcile_wallet',
      { p_wallet_id: walletId },
    );

    if (rpcError) {
      throw new Error(`reconcile_wallet RPC failed: ${rpcError.message}`);
    }

    const row = data as {
      wallet_id: string;
      currency: string;
      stored_balance: number;
      computed_balance: number;
      is_consistent: boolean;
    };

    return {
      walletId: row.wallet_id,
      currency: row.currency,
      storedBalance: row.stored_balance,
      computedBalance: row.computed_balance,
      isConsistent: row.is_consistent,
    };
  }
}
