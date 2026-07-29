'use strict';
/**
 * TreasuryService.js
 * ==================
 * Enterprise Treasury Domain — Single Source of Truth for External Assets.
 *
 * Responsibilities:
 *   - Fetches and caches live balances from every payment provider
 *   - Stores balance snapshots (immutable history)
 *   - Provides treasury overview for the admin dashboard
 *   - Coordinates provider balance sync across Fincra, Paystack, NOWPayments, Grey
 *
 * Integration contract:
 *   - NEVER modifies user wallets or ledger entries directly
 *   - NEVER calls LedgerService — treasury records are read-only observability
 *   - Only writes to treasury_provider_balances and treasury_balance_snapshots
 *   - Called by TreasuryBalanceSyncWorker on a schedule
 *
 * @module services/treasury/TreasuryService
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// ── Provider Fetcher Registry ─────────────────────────────────────────────────
// Each fetcher is responsible for returning a standardised balance object.
// Fetchers are loaded lazily to avoid circular deps and startup cost.
const PROVIDER_FETCHERS = {
  fincra:       () => require('./fetchers/FincraBalanceFetcher'),
  paystack:     () => require('./fetchers/PaystackBalanceFetcher'),
  nowpayments:  () => require('./fetchers/NowPaymentsBalanceFetcher'),
  grey:         () => require('./fetchers/GreyBalanceFetcher'),
};

/**
 * Standard balance shape returned by every provider fetcher:
 * {
 *   provider:          string,
 *   currency:          string,
 *   available_balance: number,
 *   pending_balance:   number,
 *   reserved_balance:  number,
 *   locked_balance:    number,
 *   ledger_balance:    number,
 *   raw:               object    // full provider API response
 * }
 */

class TreasuryService {

  // ── 1. Sync a Single Provider ─────────────────────────────────────────────

  /**
   * Fetch live balances from a single provider, persist to treasury_provider_balances,
   * and record an immutable snapshot.
   *
   * @param {string} providerName  - 'fincra' | 'paystack' | 'nowpayments' | 'grey'
   * @param {object} [options]
   * @param {string} [options.triggeredBy] - Actor label, e.g. 'scheduler' or 'admin:uuid'
   * @param {string} [options.snapshotType] - 'SCHEDULED' | 'MANUAL' | 'TRIGGERED' | 'BOOT'
   * @returns {Promise<Array<object>>} Array of balance records saved
   */
  async syncProvider(providerName, options = {}) {
    const { triggeredBy = 'scheduler', snapshotType = 'SCHEDULED' } = options;
    const loader = PROVIDER_FETCHERS[providerName];

    if (!loader) {
      logger.warn(`[TreasuryService] Unknown provider: ${providerName}. Skipping.`);
      return [];
    }

    const startTime = Date.now();
    let fetchedBalances = [];
    let fetchError = null;

    try {
      const fetcher = loader();
      fetchedBalances = await fetcher.fetchAll();
      logger.info(`[TreasuryService] Synced ${fetchedBalances.length} balance(s) from ${providerName}`);
    } catch (err) {
      fetchError = err;
      logger.error(`[TreasuryService] Provider sync failed for ${providerName}: ${err.message}`);
    }

    const latencyMs = Date.now() - startTime;
    const results = [];

    if (fetchError || fetchedBalances.length === 0) {
      // Mark all rows for this provider as FAILED / STALE
      await supabase
        .from('treasury_provider_balances')
        .update({
          sync_status:   'FAILED',
          sync_error:    fetchError?.message || 'No data returned',
          provider_status: 'UNKNOWN',
          last_sync_at:  new Date().toISOString(),
          next_sync_at:  new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        })
        .eq('provider', providerName);
      return results;
    }

    // Persist each balance record
    for (const balance of fetchedBalances) {
      try {
        const { error: upsertErr } = await supabase
          .from('treasury_provider_balances')
          .upsert({
            provider:          balance.provider,
            currency:          balance.currency,
            available_balance: balance.available_balance,
            pending_balance:   balance.pending_balance,
            reserved_balance:  balance.reserved_balance,
            locked_balance:    balance.locked_balance,
            ledger_balance:    balance.ledger_balance,
            provider_status:   'HEALTHY',
            sync_status:       'SUCCESS',
            sync_error:        null,
            last_sync_at:      new Date().toISOString(),
            next_sync_at:      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          }, { onConflict: 'provider,currency' });

        if (upsertErr) {
          logger.error(`[TreasuryService] Upsert failed for ${balance.provider}/${balance.currency}: ${upsertErr.message}`);
          continue;
        }

        // Compute internal user liability for this currency (filter out SYSTEM wallets)
        const { data: liabilityRow } = await supabase
          .from('wallets_v6')
          .select('balance')
          .eq('currency', balance.currency)
          .neq('network', 'SYSTEM')
          .neq('provider', 'internal');

        const internalUserLiability = (liabilityRow || [])
          .reduce((sum, w) => sum + parseFloat(w.balance || 0), 0);

        // Compute system float (SYSTEM_TRANSIT wallets)
        const { data: floatRows } = await supabase
          .from('wallets_v6')
          .select('balance')
          .eq('currency', balance.currency)
          .eq('network', 'SYSTEM')
          .like('address', 'SYSTEM_TRANSIT%');

        const internalSystemFloat = (floatRows || [])
          .reduce((sum, w) => sum + parseFloat(w.balance || 0), 0);

        // Append immutable snapshot
        await supabase.from('treasury_balance_snapshots').insert({
          provider:               balance.provider,
          currency:               balance.currency,
          snapshot_type:          snapshotType,
          available_balance:      balance.available_balance,
          pending_balance:        balance.pending_balance,
          reserved_balance:       balance.reserved_balance,
          locked_balance:         balance.locked_balance,
          internal_user_liability: internalUserLiability,
          internal_system_float:   internalSystemFloat,
          sync_latency_ms:        latencyMs,
          raw_response:           balance.raw || null,
          triggered_by:           triggeredBy,
        });

        results.push({ provider: balance.provider, currency: balance.currency, status: 'OK' });
      } catch (innerErr) {
        logger.error(`[TreasuryService] Failed to persist ${balance.provider}/${balance.currency}: ${innerErr.message}`);
      }
    }

    return results;
  }

  // ── 2. Sync All Providers ─────────────────────────────────────────────────

  /**
   * Run a full sync cycle across all registered providers.
   * Each provider is synced independently — failure in one does not block others.
   *
   * @param {object} [options]
   * @returns {Promise<object>} Summary of sync results
   */
  async syncAllProviders(options = {}) {
    const providers = Object.keys(PROVIDER_FETCHERS);
    const summary = { synced: 0, failed: 0, results: [] };

    for (const provider of providers) {
      try {
        const result = await this.syncProvider(provider, options);
        summary.synced += result.length;
        summary.results.push(...result);
      } catch (err) {
        summary.failed++;
        logger.error(`[TreasuryService] syncAllProviders failed for ${provider}: ${err.message}`);
      }
    }

    logger.info(`[TreasuryService] Full sync complete. Synced: ${summary.synced}, Failed: ${summary.failed}`);
    return summary;
  }

  // ── 3. Treasury Overview ──────────────────────────────────────────────────

  /**
   * Returns a complete treasury snapshot for the admin dashboard.
   * Combines provider-side balances with internal ledger aggregates.
   *
   * @returns {Promise<object>}
   */
  async getTreasuryOverview() {
    // Provider balances
    const { data: providerBalances, error: pbErr } = await supabase
      .from('treasury_provider_balances')
      .select('*')
      .order('provider');

    if (pbErr) logger.error('[TreasuryService] Error fetching provider balances:', pbErr.message);

    // Internal user wallets (aggregated by currency, excluding SYSTEM)
    const { data: walletTotals } = await supabase
      .from('wallets_v6')
      .select('currency, balance, pending_balance, locked_balance')
      .neq('network', 'SYSTEM');

    const internalByCurrency = {};
    for (const w of (walletTotals || [])) {
      const cur = (w.currency || '').toUpperCase();
      if (!internalByCurrency[cur]) {
        internalByCurrency[cur] = { user_liability: 0, pending: 0, locked: 0 };
      }
      internalByCurrency[cur].user_liability += parseFloat(w.balance || 0);
      internalByCurrency[cur].pending        += parseFloat(w.pending_balance || 0);
      internalByCurrency[cur].locked         += parseFloat(w.locked_balance || 0);
    }

    // Latest reserve ratios
    const { data: latestRatios } = await supabase
      .from('reserve_ratios')
      .select('currency, provider, reserve_ratio, status, calculated_at')
      .order('calculated_at', { ascending: false })
      .limit(50);

    // Pending settlements count
    const { count: pendingSettlements } = await supabase
      .from('settlements')
      .select('*', { count: 'exact', head: true })
      .in('current_stage', ['INITIATED', 'PROVIDER_PENDING', 'PROVIDER_CONFIRMED', 'LEDGER_POSTED']);

    // Pending payouts
    const { count: pendingPayouts } = await supabase
      .from('payout_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'pending_review', 'approved', 'processing']);

    return {
      success:            true,
      timestamp:          new Date().toISOString(),
      provider_balances:  providerBalances || [],
      internal_balances:  internalByCurrency,
      reserve_ratios:     latestRatios || [],
      pending_settlements: pendingSettlements || 0,
      pending_payouts:    pendingPayouts || 0,
    };
  }

  // ── 4. Get Latest Provider Balance ────────────────────────────────────────

  /**
   * Returns the most recently synced balance for a provider+currency pair.
   *
   * @param {string} provider
   * @param {string} currency
   * @returns {Promise<object|null>}
   */
  async getProviderBalance(provider, currency) {
    const { data, error } = await supabase
      .from('treasury_provider_balances')
      .select('*')
      .eq('provider', provider)
      .eq('currency', currency.toUpperCase())
      .maybeSingle();

    if (error) {
      logger.error(`[TreasuryService] getProviderBalance error: ${error.message}`);
      return null;
    }
    return data;
  }

  // ── 5. Get Snapshot History ───────────────────────────────────────────────

  /**
   * Returns paginated snapshot history for a provider+currency pair.
   *
   * @param {string} provider
   * @param {string} currency
   * @param {number} [limit=100]
   * @returns {Promise<Array>}
   */
  async getSnapshotHistory(provider, currency, limit = 100) {
    const { data, error } = await supabase
      .from('treasury_balance_snapshots')
      .select('*')
      .eq('provider', provider)
      .eq('currency', currency.toUpperCase())
      .order('captured_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(`[TreasuryService] getSnapshotHistory error: ${error.message}`);
      return [];
    }
    return data || [];
  }
}

module.exports = new TreasuryService();
