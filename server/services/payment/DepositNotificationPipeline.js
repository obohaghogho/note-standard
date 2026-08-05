'use strict';

/**
 * server/services/payment/DepositNotificationPipeline.js
 * =========================================================
 * Real-Time Deposit Notification Pipeline.
 * Dispatches push & socket alerts at key deposit milestones:
 *  - DEPOSIT_DETECTED
 *  - DEPOSIT_MATCHED
 *  - DEPOSIT_CREDITED
 *  - DEPOSIT_UNDER_REVIEW
 *  - DEPOSIT_FAILED
 */

const logger = require('../../utils/logger');
const supabase = require('../../config/database');

class DepositNotificationPipeline {
  async notifyUser(userId, eventType, data = {}) {
    logger.info(`[DepositNotificationPipeline] Dispatching ${eventType} for user ${userId} [corrId=${data.correlationId || 'N/A'}]`);

    try {
      await supabase.from('user_notifications').insert({
        user_id: userId,
        type: eventType,
        title: this._getTitle(eventType, data),
        message: this._getMessage(eventType, data),
        metadata: data,
        read: false,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      logger.warn(`[DepositNotificationPipeline] DB notification insert warning: ${e.message}`);
    }
  }

  _getTitle(eventType, data) {
    switch (eventType) {
      case 'DEPOSIT_DETECTED': return 'Deposit Detected';
      case 'DEPOSIT_MATCHED': return 'Deposit Matched';
      case 'DEPOSIT_CREDITED': return `Deposit Credited (${data.currency || ''} ${data.amount || ''})`;
      case 'DEPOSIT_UNDER_REVIEW': return 'Deposit Under Compliance Review';
      case 'DEPOSIT_FAILED': return 'Deposit Failed';
      default: return 'Wallet Activity Update';
    }
  }

  _getMessage(eventType, data) {
    switch (eventType) {
      case 'DEPOSIT_DETECTED': return 'Your incoming bank transfer has been detected.';
      case 'DEPOSIT_MATCHED': return 'Your transfer reference has been matched to your deposit session.';
      case 'DEPOSIT_CREDITED': return `Your wallet has been credited with ${data.currency} ${data.amount}.`;
      case 'DEPOSIT_UNDER_REVIEW': return 'Your deposit is under routine compliance verification.';
      case 'DEPOSIT_FAILED': return 'Your deposit could not be processed.';
      default: return 'Your wallet activity has been updated.';
    }
  }
}

module.exports = new DepositNotificationPipeline();
