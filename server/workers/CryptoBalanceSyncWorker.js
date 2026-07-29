'use strict';
/**
 * CryptoBalanceSyncWorker.js
 * ==========================
 * Periodic background worker (every 5 minutes) syncing crypto custody
 * balances from NOWPayments into treasury_provider_balances and crypto_wallet_inventory.
 *
 * @module workers/CryptoBalanceSyncWorker
 */

const logger = require('../utils/logger');
const NowPaymentsBalanceFetcher = require('../services/treasury/fetchers/NowPaymentsBalanceFetcher');
const CryptoWalletInventoryService = require('../services/treasury/CryptoWalletInventoryService');
const supabase = require('../config/database');

let intervalId = null;

const CryptoBalanceSyncWorker = {
  start(intervalMs = 5 * 60 * 1000) {
    if (intervalId) return;
    logger.info('[CryptoBalanceSyncWorker] Starting crypto balance sync worker...');

    intervalId = setInterval(() => {
      this.sync().catch(err => logger.error(`[CryptoBalanceSyncWorker] Sync error: ${err.message}`));
    }, intervalMs);

    // Initial run
    setImmediate(() => this.sync().catch(() => {}));
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  async sync() {
    try {
      const balances = await NowPaymentsBalanceFetcher.fetchAll();
      if (!balances || balances.length === 0) return;

      for (const b of balances) {
        // 1. Update treasury_provider_balances
        await supabase
          .from('treasury_provider_balances')
          .upsert({
            provider:          'nowpayments',
            currency:          b.currency,
            available_balance: b.available_balance,
            pending_balance:   b.pending_balance,
            sync_status:       'SUCCESS',
            last_synced_at:    new Date().toISOString(),
          }, { onConflict: 'provider,currency' })
          .catch(e => logger.warn(`[CryptoBalanceSyncWorker] DB upsert warn: ${e.message}`));

        // 2. Sync into Hot Wallet Inventory
        await CryptoWalletInventoryService.syncWallet({
          currency:   b.currency,
          network:    'NATIVE',
          walletType: 'HOT',
          provider:   'nowpayments',
          address:    'NOWPAYMENTS_CUSTODY_HOT',
          balance:    b.ledger_balance,
          available:  b.available_balance,
        });
      }

      logger.info(`[CryptoBalanceSyncWorker] Synced ${balances.length} crypto balances`);
    } catch (err) {
      logger.error(`[CryptoBalanceSyncWorker] Sync cycle failed: ${err.message}`);
    }
  },
};

module.exports = CryptoBalanceSyncWorker;
