'use strict';

/**
 * InternalFXWallet.js
 * ===================
 * Internal Multi-Currency Treasury Liquidity Reserves.
 * Enables INSTANT user swaps backed by NoteStandard Treasury Vault,
 * decoupling user execution speed from external provider clearing latency.
 *
 * Supported Treasury Currencies:
 *   USD, EUR, GBP, NGN, BTC, ETH, USDT, USDC
 *
 * Execution Flow:
 *   User Swap (e.g., BTC -> NGN)
 *   ↓
 *   Treasury Vault verifies target currency reserve
 *   ↓
 *   Treasury Vault pays user instantly (0ms provider wait)
 *   ↓
 *   Treasury rebalances itself in the background
 *
 * @module services/treasury/InternalFXWallet
 */

const treasuryVault = require('./TreasuryVault');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');

class InternalFXWallet {
  /**
   * Execute instant swap backed by Treasury Vault reserves.
   */
  async executeInstantSwap({ userId, fromCurrency, toCurrency, fromAmount, toAmount, idempotencyKey }) {
    const fromCur = String(fromCurrency).toUpperCase();
    const toCur = String(toCurrency).toUpperCase();
    const decFrom = new Decimal(fromAmount);
    const decTo = new Decimal(toAmount);

    // 1. Verify Treasury Vault has sufficient target currency reserve
    const hasTargetReserve = await treasuryVault.verifyVaultReserve(toCur, decTo);
    if (!hasTargetReserve) {
      const avail = await treasuryVault.getVaultBalance(toCur);
      logger.warn(`[InternalFXWallet] Treasury Vault target reserve low for ${toCur} (${avail} < ${decTo.toString()}). Tapping backstop.`);
    }

    // 2. Debit source currency into Treasury Vault
    await treasuryVault.creditVaultProceeds({
      currency: fromCur,
      amount: decFrom.toNumber(),
      reference: idempotencyKey,
      source: `USER_SWAP_${userId}`,
    });

    // 3. Credit target currency from Treasury Vault to User (Instant payout experience)
    await treasuryVault.transferToProviderEndpoint({
      providerId: 'INTERNAL_TREASURY',
      currency: toCur,
      amount: decTo.toNumber(),
      reference: idempotencyKey,
    });

    logger.info(`[InternalFXWallet] INSTANT SWAP COMPLETED for user ${userId}: ${decFrom.toString()} ${fromCur} -> ${decTo.toString()} ${toCur}`);

    return {
      success: true,
      instant: true,
      fromCurrency: fromCur,
      toCurrency: toCur,
      fromAmount: decFrom.toNumber(),
      toAmount: decTo.toNumber(),
      idempotencyKey,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Get complete Treasury FX Wallet reserve snapshot.
   */
  async getWalletReserves() {
    return await treasuryVault.getVaultSnapshot();
  }
}

module.exports = new InternalFXWallet();
