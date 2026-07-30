'use strict';

/**
 * CryptoCustodySyncWorker
 * =======================
 * 5-minute background poller syncing custody balances from settlement providers
 * (NOWPayments, Fincra, Anchor, etc.) into `custody_balances` and `custody_sync_logs`.
 */

const pool = require('../config/pgPool');
const settlementLayerRouter = require('../services/settlement/SettlementLayerRouter');
const eventBus = require('../services/events/LocalEventBus');
const logger = require('../utils/logger');

let timer = null;
let lastHeartbeat = Date.now();

const CryptoCustodySyncWorker = {
  start(intervalMs = 5 * 60 * 1000) {
    if (timer) return;
    logger.info('[CryptoCustodySyncWorker] Starting Crypto Custody Sync Worker (every 5 mins)...');
    timer = setInterval(() => this.sync().catch(err => logger.error(`[CryptoCustodySyncWorker] Sync error: ${err.message}`)), intervalMs);
  },

  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },

  getHeartbeat() {
    return {
      status: timer ? 'ACTIVE' : 'INACTIVE',
      lastHeartbeatAt: new Date(lastHeartbeat).toISOString(),
      ageSeconds: Math.round((Date.now() - lastHeartbeat) / 1000)
    };
  },

  async sync() {
    lastHeartbeat = Date.now();
    const startTime = Date.now();
    try {
      logger.info('[CryptoCustodySyncWorker] Syncing custody balances from providers...');
      const balances = await settlementLayerRouter.getAggregatedCustodyBalances();

      for (const b of balances) {
        await pool.query(
          `INSERT INTO public.custody_balances (provider_id, currency, available, locked, pending, last_synced_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (provider_id, currency) DO UPDATE SET
             available = EXCLUDED.available,
             locked = EXCLUDED.locked,
             pending = EXCLUDED.pending,
             last_synced_at = NOW()`,
          [b.provider, b.currency, b.available, b.locked || 0, b.pending || 0]
        );
      }

      const duration = Date.now() - startTime;
      await pool.query(
        `INSERT INTO public.custody_sync_logs (provider_id, response_data, duration_ms)
         VALUES ('NOWPAYMENTS', $1, $2)`,
        [JSON.stringify(balances), duration]
      );

      logger.info(`[CryptoCustodySyncWorker] Synced ${balances.length} provider custody balances in ${duration}ms.`);
      await eventBus.publish('treasury.synced', { count: balances.length, durationMs: duration });
      return balances;
    } catch (err) {
      logger.error(`[CryptoCustodySyncWorker] Sync error: ${err.message}`);
      throw err;
    }
  }
};

module.exports = CryptoCustodySyncWorker;
