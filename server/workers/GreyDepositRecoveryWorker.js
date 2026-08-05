'use strict';

const supabase = require('../config/database');
const logger = require('../utils/logger');
const GreyBankingProvider = require('../services/settlement/GreyBankingProvider');
const DepositMatchingService = require('../services/treasury/DepositMatchingService');

/**
 * GreyDepositRecoveryWorker
 * =========================
 * Background polling worker running on a 60-second interval.
 * Checks for pending ACH/Wire deposits, missing webhooks, and stuck transactions from Grey API.
 */
class GreyDepositRecoveryWorker {
  constructor() {
    this.greyBanking = new GreyBankingProvider();
    this.intervalMs = 60000; // 60s polling interval
    this.timer = null;
    this.isProcessing = false;
  }

  start() {
    logger.info('[GreyDepositRecoveryWorker] Background deposit recovery worker started (60s interval)...');
    this.timer = setInterval(() => this.processIncomingTransfers().catch(e => {
      logger.error(`[GreyDepositRecoveryWorker] Error in poll loop: ${e.message}`);
    }), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[GreyDepositRecoveryWorker] Recovery worker stopped.');
    }
  }

  async processIncomingTransfers() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Fetch incoming transfers from Grey API
      const transfers = await this.greyBanking.getIncomingTransfers({ limit: 50 });

      if (!transfers || transfers.length === 0) {
        return;
      }

      logger.info(`[GreyDepositRecoveryWorker] Poll retrieved ${transfers.length} incoming deposits from Grey API`);

      for (const transfer of transfers) {
        try {
          await DepositMatchingService.matchAndProcessDeposit(transfer);
        } catch (mErr) {
          logger.error(`[GreyDepositRecoveryWorker] Matching error for transfer ${transfer.providerTxId}: ${mErr.message}`);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new GreyDepositRecoveryWorker();
