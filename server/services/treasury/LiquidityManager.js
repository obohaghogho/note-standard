'use strict';

/**
 * LiquidityManager.js
 * ===================
 * Maintains real-time live balances across every registered provider adapter.
 * Tracks 5 explicit balance states per provider & currency:
 *   1. Available Balance  - Immediately spendable at provider
 *   2. Locked Balance     - Earmarked in active processing
 *   3. Pending Balance    - Transfers in transit
 *   4. Reserved Balance   - Earmarked for queued payouts/auto-replenishment
 *   5. Settlement Balance - Incoming clearing funds
 *
 * Provides atomic reserve, release, commit, and sync capabilities.
 *
 * @module services/treasury/LiquidityManager
 */

const adapterRegistry = require('./adapters/AdapterRegistry');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');

class LiquidityManager {
  constructor() {
    // In-memory cache of balances keyed by `${providerId}:${currency}`
    this.liquidityStore = new Map();
  }

  /**
   * Sync balances from all registered provider adapters.
   */
  async syncAllProviders() {
    const adapters = adapterRegistry.getAll();
    const syncResults = {};

    for (const adapter of adapters) {
      const provId = adapter.getProviderId();
      try {
        const balances = await adapter.getBalances();
        for (const [cur, data] of Object.entries(balances)) {
          const key = `${provId}:${cur.toUpperCase()}`;
          const current = this.liquidityStore.get(key) || {
            available: 0, locked: 0, pending: 0, reserved: 0, settlement: 0
          };

          this.liquidityStore.set(key, {
            available:  Number(data.available ?? current.available),
            locked:     Number(data.locked ?? current.locked),
            pending:    Number(data.pending ?? current.pending),
            reserved:   Number(data.reserved ?? current.reserved),
            settlement: Number(data.settlement ?? current.settlement),
            lastSyncedAt: new Date().toISOString(),
          });
        }
        syncResults[provId] = 'SYNCED';
      } catch (err) {
        logger.error(`[LiquidityManager] Failed to sync ${provId}: ${err.message}`);
        syncResults[provId] = 'FAILED';
      }
    }
    return syncResults;
  }

  /**
   * Get 5-state liquidity details for a provider & currency.
   */
  async getLiquidity(providerId, currency) {
    const key = `${String(providerId).toUpperCase()}:${String(currency).toUpperCase()}`;
    if (!this.liquidityStore.has(key)) {
      // Lazy sync for this adapter
      try {
        const adapter = adapterRegistry.get(providerId);
        const avail = await adapter.getAvailableLiquidity(currency);
        const locked = await adapter.getLockedLiquidity(currency);
        this.liquidityStore.set(key, {
          available: avail,
          locked: locked,
          pending: 0,
          reserved: 0,
          settlement: 0,
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (err) {
        this.liquidityStore.set(key, { available: 0, locked: 0, pending: 0, reserved: 0, settlement: 0 });
      }
    }
    return this.liquidityStore.get(key);
  }

  /**
   * Check if provider has enough net available (Available - Reserved >= requiredAmount).
   */
  async verifyLiquidity(providerId, currency, amount) {
    const liq = await this.getLiquidity(providerId, currency);
    const netAvailable = new Decimal(liq.available).sub(new Decimal(liq.reserved));
    return netAvailable.gte(new Decimal(amount));
  }

  /**
   * Earmark/Reserve liquidity for an upcoming payout.
   */
  async reserveLiquidity(providerId, currency, amount) {
    const prov = String(providerId).toUpperCase();
    const cur = String(currency).toUpperCase();
    const key = `${prov}:${cur}`;

    const hasLiq = await this.verifyLiquidity(prov, cur, amount);
    if (!hasLiq) {
      const liq = await this.getLiquidity(prov, cur);
      throw new Error(`[LiquidityManager] Cannot reserve ${amount} ${cur} on ${prov}. Available: ${liq.available}, Reserved: ${liq.reserved}`);
    }

    const state = this.liquidityStore.get(key);
    state.reserved = new Decimal(state.reserved).add(new Decimal(amount)).toNumber();
    this.liquidityStore.set(key, state);

    logger.info(`[LiquidityManager] Reserved ${amount} ${cur} on ${prov}. New Reserved: ${state.reserved}`);
    return true;
  }

  /**
   * Release reserved liquidity if payout is cancelled or failed.
   */
  async releaseLiquidity(providerId, currency, amount) {
    const prov = String(providerId).toUpperCase();
    const cur = String(currency).toUpperCase();
    const key = `${prov}:${cur}`;

    const state = await this.getLiquidity(prov, cur);
    state.reserved = Math.max(0, new Decimal(state.reserved).sub(new Decimal(amount)).toNumber());
    this.liquidityStore.set(key, state);

    logger.info(`[LiquidityManager] Released ${amount} ${cur} on ${prov}. New Reserved: ${state.reserved}`);
    return true;
  }

  /**
   * Commit reserved liquidity when payout executes.
   */
  async commitLiquidity(providerId, currency, amount) {
    const prov = String(providerId).toUpperCase();
    const cur = String(currency).toUpperCase();
    const key = `${prov}:${cur}`;

    const state = await this.getLiquidity(prov, cur);
    state.reserved = Math.max(0, new Decimal(state.reserved).sub(new Decimal(amount)).toNumber());
    state.available = Math.max(0, new Decimal(state.available).sub(new Decimal(amount)).toNumber());
    this.liquidityStore.set(key, state);

    logger.info(`[LiquidityManager] Committed ${amount} ${cur} payout on ${prov}. Available: ${state.available}`);
    return true;
  }

  /**
   * Credit incoming liquidity to provider endpoint.
   */
  async creditLiquidity(providerId, currency, amount) {
    const prov = String(providerId).toUpperCase();
    const cur = String(currency).toUpperCase();
    const key = `${prov}:${cur}`;

    const state = await this.getLiquidity(prov, cur);
    state.available = new Decimal(state.available).add(new Decimal(amount)).toNumber();
    this.liquidityStore.set(key, state);

    logger.info(`[LiquidityManager] Credited ${amount} ${cur} to ${prov}. New Available: ${state.available}`);
    return true;
  }

  /**
   * Get total liquidity aggregated across ALL providers per currency.
   */
  async getAggregatedLiquidity() {
    await this.syncAllProviders();
    const aggregated = {};

    for (const [key, state] of this.liquidityStore.entries()) {
      const [, currency] = key.split(':');
      if (!aggregated[currency]) {
        aggregated[currency] = {
          totalAvailable:  0,
          totalLocked:     0,
          totalPending:    0,
          totalReserved:   0,
          totalSettlement: 0,
          providers: {},
        };
      }

      aggregated[currency].totalAvailable += state.available;
      aggregated[currency].totalLocked += state.locked;
      aggregated[currency].totalPending += state.pending;
      aggregated[currency].totalReserved += state.reserved;
      aggregated[currency].totalSettlement += state.settlement;
      aggregated[currency].providers[key.split(':')[0]] = state;
    }
    return aggregated;
  }
}

module.exports = new LiquidityManager();
