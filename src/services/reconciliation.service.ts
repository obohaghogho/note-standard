// ============================================================================
// Reconciliation Service
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReconciliationResult, Wallet } from '@/types';
import { AuditService } from './audit.service';
import { ActorType } from '@/types';

export interface ReconciliationReport {
  totalWallets: number;
  consistentWallets: number;
  inconsistentWallets: number;
  results: ReconciliationResult[];
  timestamp: string;
}

export class ReconciliationService {
  private readonly audit: AuditService;

  constructor(private readonly supabase: SupabaseClient) {
    this.audit = new AuditService(supabase);
  }

  /**
   * Reconcile a single wallet and return the result.
   */
  async reconcileWallet(walletId: string): Promise<ReconciliationResult> {
    const { data, error } = await this.supabase.rpc('reconcile_wallet', {
      p_wallet_id: walletId,
    });

    if (error) throw new Error(`reconcile_wallet RPC failed: ${error.message}`);

    // The RPC returns a set (array). Extract the first row.
    const rows = Array.isArray(data) ? data : [data];
    const row = rows[0];

    const result: ReconciliationResult = {
      walletId,
      currency: '',
      storedBalance: row?.stored_balance ?? 0,
      computedBalance: row?.computed_balance ?? 0,
      isConsistent: row?.is_consistent ?? false,
    };

    // Fetch currency for the result
    const { data: walletData } = await this.supabase
      .from('wallets')
      .select('currency')
      .eq('id', walletId)
      .single();

    if (walletData) {
      result.currency = walletData.currency;
    }

    // Log if inconsistent
    if (!result.isConsistent) {
      console.error(
        `[Reconciliation] INCONSISTENCY DETECTED: wallet ${walletId} — ` +
        `stored=${result.storedBalance}, computed=${result.computedBalance}`,
      );

      await this.audit.log({
        actorId: walletId,
        actorType: ActorType.SYSTEM,
        action: 'reconciliation.inconsistency',
        resourceType: 'wallet',
        resourceId: walletId,
        changes: {
          before: { balance: result.storedBalance },
          after: { computedBalance: result.computedBalance },
        },
        metadata: { severity: 'critical' },
      });
    }

    return result;
  }

  /**
   * Reconcile ALL wallets in the system. Returns a full report.
   */
  async reconcileAll(): Promise<ReconciliationReport> {
    const { data: wallets, error } = await this.supabase
      .from('wallets')
      .select('id')
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch wallets: ${error.message}`);

    const results: ReconciliationResult[] = [];

    for (const wallet of wallets || []) {
      try {
        const result = await this.reconcileWallet(wallet.id);
        results.push(result);
      } catch (err) {
        console.error(`[Reconciliation] Failed for wallet ${wallet.id}:`, err);
        results.push({
          walletId: wallet.id,
          currency: 'unknown',
          storedBalance: -1,
          computedBalance: -1,
          isConsistent: false,
        });
      }
    }

    const report: ReconciliationReport = {
      totalWallets: results.length,
      consistentWallets: results.filter((r) => r.isConsistent).length,
      inconsistentWallets: results.filter((r) => !r.isConsistent).length,
      results,
      timestamp: new Date().toISOString(),
    };

    // Audit log the full reconciliation run
    await this.audit.log({
      actorId: '00000000-0000-0000-0000-000000000000',
      actorType: ActorType.SYSTEM,
      action: 'reconciliation.full_run',
      resourceType: 'system',
      resourceId: '00000000-0000-0000-0000-000000000000',
      metadata: {
        totalWallets: report.totalWallets,
        consistent: report.consistentWallets,
        inconsistent: report.inconsistentWallets,
      },
    });

    return report;
  }
}
