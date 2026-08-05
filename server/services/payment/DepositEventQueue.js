'use strict';

/**
 * server/services/payment/DepositEventQueue.js
 * ===============================================
 * Event-Driven Processing Queue for incoming Webhooks & Deposit Matching.
 * Propagates correlation ID (`corr_01K...`) end-to-end to minimize processing latency.
 */

const logger = require('../../utils/logger');
const DepositMatchingService = require('./DepositMatchingService');
const DepositNotificationPipeline = require('./DepositNotificationPipeline');

class DepositEventQueue {
  /**
   * Enqueue incoming webhook event for real-time processing
   */
  async processEvent(provider, rawPayload, correlationId = null) {
    const corrId = correlationId || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    logger.info(`[DepositEventQueue] Processing event from ${provider} [corrId=${corrId}]`);

    try {
      const matchResult = await DepositMatchingService.matchDeposit(provider, rawPayload, corrId);

      if (matchResult.matched && matchResult.userId) {
        await DepositNotificationPipeline.notifyUser(matchResult.userId, 'DEPOSIT_CREDITED', {
          amount: matchResult.amount,
          currency: matchResult.currency,
          reference: matchResult.reference,
          correlationId: corrId
        });
      }

      return { success: true, correlationId: corrId, matchResult };
    } catch (err) {
      logger.error(`[DepositEventQueue] Event processing failed [corrId=${corrId}]: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DepositEventQueue();
