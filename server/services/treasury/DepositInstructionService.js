'use strict';

const BankingProviderRouter = require('../settlement/BankingProviderRouter');
const logger = require('../../utils/logger');

/**
 * DepositInstructionService
 * =========================
 * Service generating structured, provider-dynamic deposit instructions for users.
 * Never hardcodes account details — fetches dynamically from BankingProviderRouter.
 */
class DepositInstructionService {
  /**
   * Fetch deposit instructions for a specified currency and rail
   */
  async getDepositInstructions({ currency = 'USD', rail = 'ACH', userId }) {
    try {
      const instructions = await BankingProviderRouter.getDepositInstructions({
        currency,
        rail,
        userId
      });

      return {
        success: true,
        data: instructions
      };
    } catch (err) {
      logger.error(`[DepositInstructionService] Error generating instructions: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DepositInstructionService();
