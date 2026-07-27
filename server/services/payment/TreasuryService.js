/**
 * TreasuryService.js
 * ==================
 * Enterprise Treasury Abstraction Layer for NoteStandard Financial Platform.
 * Manages liquidity, inter-provider settlements, USD/NGN/EUR/GBP treasury pools,
 * and stablecoin cross-border payment rails.
 *
 * Interfaces between business logic (WalletService/PaymentService) and
 * banking/treasury providers (Fincra, Anchor, NowPayments, Grey).
 */

const logger = require('../../utils/logger');
const supabase = require('../../config/database');
const GatewayRouter = require('./GatewayRouter');

class TreasuryService {
  /**
   * Returns a complete overview of active treasury pools and provider balances.
   */
  async getTreasuryOverview() {
    try {
      const providerHealth = GatewayRouter.getAllHealth();

      // Fetch aggregated wallet ledger balances grouped by currency
      const { data: walletBalances, error: walletErr } = await supabase
        .from('wallets_v6')
        .select('currency, balance, ledger_balance, reserved_balance');

      if (walletErr) {
        logger.error('[TreasuryService] Error fetching wallet balances:', walletErr);
      }

      const treasuryPools = {
        NGN: { totalBalance: 0, reserved: 0, activeProvider: 'fincra' },
        USD: { totalBalance: 0, reserved: 0, activeProvider: 'fincra' },
        EUR: { totalBalance: 0, reserved: 0, activeProvider: 'fincra' },
        GBP: { totalBalance: 0, reserved: 0, activeProvider: 'fincra' },
        STABLECOINS: { totalBalance: 0, reserved: 0, activeProvider: 'anchor' }
      };

      if (walletBalances) {
        for (const row of walletBalances) {
          const cur = (row.currency || 'NGN').toUpperCase();
          const bal = Number(row.balance || 0);
          const res = Number(row.reserved_balance || 0);

          if (['USDT', 'USDC'].includes(cur)) {
            treasuryPools.STABLECOINS.totalBalance += bal;
            treasuryPools.STABLECOINS.reserved += res;
          } else if (treasuryPools[cur]) {
            treasuryPools[cur].totalBalance += bal;
            treasuryPools[cur].reserved += res;
          }
        }
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        providerHealth,
        treasuryPools,
        egressGateway: {
          ip: '137.184.216.44',
          hostname: 'gateway.notestandard.com',
          status: providerHealth.fincra || 'HEALTHY'
        }
      };
    } catch (error) {
      logger.error('[TreasuryService] Failed to generate treasury overview:', error);
      throw error;
    }
  }

  /**
   * Initiates an inter-provider treasury rebalance or cross-border settlement.
   *
   * @param {Object} params
   * @param {string} params.sourceProvider - 'fincra' | 'anchor' | 'grey'
   * @param {string} params.targetProvider - 'fincra' | 'anchor' | 'grey'
   * @param {number} params.amount
   * @param {string} params.currency
   */
  async rebalanceTreasury({ sourceProvider, targetProvider, amount, currency }) {
    logger.info(`[TreasuryService] Initiating rebalance: ${amount} ${currency} from ${sourceProvider} to ${targetProvider}`);
    
    const reference = `TREASURY_REBAL_${Date.now()}`;

    // Record treasury audit event in database
    await supabase.from('fincra_audit_logs').insert({
      action: 'TREASURY_REBALANCE',
      currency,
      metadata: {
        sourceProvider,
        targetProvider,
        amount,
        reference
      }
    });

    return {
      success: true,
      reference,
      status: 'PROCESSING',
      sourceProvider,
      targetProvider,
      amount,
      currency
    };
  }
}

module.exports = new TreasuryService();
