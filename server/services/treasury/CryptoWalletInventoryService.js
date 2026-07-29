'use strict';
/**
 * CryptoWalletInventoryService.js
 * =================================
 * Manages Hot, Warm, and Cold wallet balances across providers and vault storage.
 * Provides multi-tier liquidity visibility for crypto assets.
 *
 * @module services/treasury/CryptoWalletInventoryService
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

class CryptoWalletInventoryService {
  /**
   * Sync a wallet entry into crypto_wallet_inventory
   */
  async syncWallet({ currency, network, walletType, provider = 'nowpayments', address, balance, available, reserved = 0 }) {
    const cur = String(currency).toUpperCase();
    const net = String(network).toUpperCase();
    const type = String(walletType).toUpperCase();

    try {
      const { data, error } = await supabase
        .from('crypto_wallet_inventory')
        .upsert({
          currency:       cur,
          network:        net,
          wallet_type:    type,
          provider:       provider.toLowerCase(),
          address,
          balance:        parseFloat(balance || 0),
          available:      parseFloat(available || balance || 0),
          reserved:       parseFloat(reserved || 0),
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'currency,network,wallet_type,provider,address' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      logger.error(`[CryptoWalletInventory] Sync failed for ${cur}/${net} (${type}): ${err.message}`);
      return null;
    }
  }

  /**
   * Get complete wallet inventory summary grouped by currency, network, and wallet_type.
   */
  async getInventorySummary() {
    try {
      const { data } = await supabase
        .from('crypto_wallet_inventory')
        .select('*')
        .order('currency', { ascending: true });

      const inventory = {};

      for (const row of (data || [])) {
        const key = `${row.currency}_${row.network}`;
        if (!inventory[key]) {
          inventory[key] = {
            currency:    row.currency,
            network:     row.network,
            total:       0,
            hot:         0,
            warm:        0,
            cold:        0,
            wallets:     [],
          };
        }

        const bal = parseFloat(row.balance || 0);
        inventory[key].total += bal;

        if (row.wallet_type === 'HOT')  inventory[key].hot  += bal;
        if (row.wallet_type === 'WARM') inventory[key].warm += bal;
        if (row.wallet_type === 'COLD') inventory[key].cold += bal;

        inventory[key].wallets.push(row);
      }

      return Object.values(inventory);
    } catch (err) {
      logger.error(`[CryptoWalletInventory] Get summary failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get specific liquidity total for an asset/network across Hot & Warm tier.
   */
  async getAvailableLiquidBalance(currency, network = 'NATIVE') {
    const summary = await this.getInventorySummary();
    const item = summary.find(
      i => i.currency === currency.toUpperCase() && (network === 'ALL' || i.network === network.toUpperCase())
    );
    return item ? (item.hot + item.warm) : 0;
  }
}

module.exports = new CryptoWalletInventoryService();
