/**
 * Enterprise Treasury FX Conversion Service
 * ─────────────────────────────────────────────
 * Executes provider corporate FX conversions, tracks quote references,
 * and performs deterministic balance polling (NO arbitrary sleep delays).
 */

const logger = require("../../utils/logger");
const TreasuryReservationService = require("./TreasuryReservationService");

class TreasuryConversionService {
  /**
   * Execute corporate FX conversion and confirm destination liquidity.
   */
  async executeConversion({ provider, fundingDecision, treasuryReference, withdrawalReference }) {
    const {
      sourceCurrency,
      destinationCurrency,
      sourceAmount,
      destinationAmount,
      quoteReference
    } = fundingDecision;

    logger.info(`[TreasuryConversionService] Initiating corporate conversion for ${withdrawalReference}: ${sourceAmount} ${sourceCurrency} -> ${destinationAmount} ${destinationCurrency} (Quote: ${quoteReference || 'N/A'})`);

    // 1. Lock FX Quote in DB
    await TreasuryReservationService.updateStatus({
      treasuryReference,
      status: "FX_QUOTE_LOCKED",
      quoteReference
    });

    let conversionRes;
    try {
      // 2. Submit conversion to provider
      if (typeof provider.executeConversion === "function") {
        conversionRes = await provider.executeConversion({
          quoteReference,
          sourceCurrency,
          destinationCurrency,
          amount: sourceAmount,
          userId: "SYSTEM_AUTO_TREASURY"
        });
      } else {
        // Fallback to Fincra conversion module wrapper
        const { executeFincraConversion } = require("../fincra/conversion");
        conversionRes = await executeFincraConversion({
          quoteReference,
          userId: "SYSTEM_AUTO_TREASURY",
          sourceCurrency,
          destinationCurrency,
          amount: sourceAmount
        });
      }

      const conversionReference = conversionRes?.conversionReference || conversionRes?.fincraRef || conversionRes?.reference || `FIN_CONV_${Date.now()}`;

      await TreasuryReservationService.updateStatus({
        treasuryReference,
        status: "CONVERSION_SUBMITTED",
        conversionReference
      });

      logger.info(`[TreasuryConversionService] Conversion submitted. Ref: ${conversionReference}. Polling destination liquidity for ${destinationCurrency}...`);

      // 3. Deterministic destination balance polling with bounded backoff (NO arbitrary sleep)
      const confirmedBalance = await this.pollProviderDestinationBalance({
        provider,
        currency: destinationCurrency,
        requiredAmount: destinationAmount,
        maxAttempts: 6,
        initialDelayMs: 500
      });

      await TreasuryReservationService.updateStatus({
        treasuryReference,
        status: "CONVERSION_SETTLED",
        conversionReference
      });

      await TreasuryReservationService.updateStatus({
        treasuryReference,
        status: "PAYOUT_FUNDS_CONFIRMED",
        conversionReference
      });

      logger.info(`[TreasuryConversionService] ✅ Destination liquidity confirmed (${confirmedBalance} >= ${destinationAmount} ${destinationCurrency}). Ready for payout.`);

      return {
        success: true,
        conversionReference,
        confirmedBalance,
        status: "PAYOUT_FUNDS_CONFIRMED"
      };

    } catch (err) {
      logger.error(`[TreasuryConversionService] Conversion execution error for ${withdrawalReference}: ${err.message}`);

      // Handle timeout as UNKNOWN / RECONCILIATION_REQUIRED, not automatic failure
      const isTimeout = err.message.includes("timeout") || err.message.includes("504") || err.code === "ETIMEDOUT";
      const failureStatus = isTimeout ? "CONVERSION_TIMEOUT" : "CONVERSION_FAILED";

      await TreasuryReservationService.updateStatus({
        treasuryReference,
        status: failureStatus,
        errorCode: isTimeout ? "CONVERSION_TIMEOUT" : "CONVERSION_ERROR",
        errorMessage: err.message
      });

      if (isTimeout) {
        await TreasuryReservationService.updateStatus({
          treasuryReference,
          status: "RECONCILIATION_REQUIRED",
          errorCode: "CONVERSION_TIMEOUT_RECONCILE",
          errorMessage: `Conversion response timed out: ${err.message}. Marked for reconciliation.`
        });
      }

      throw err;
    }
  }

  /**
   * Deterministically polls provider destination wallet balance until available >= required.
   * Uses bounded exponential backoff: 500ms, 1000ms, 2000ms, 4000ms, 8000ms...
   */
  async pollProviderDestinationBalance({ provider, currency, requiredAmount, maxAttempts = 6, initialDelayMs = 500 }) {
    let attempts = 0;
    let currentDelay = initialDelayMs;

    while (attempts < maxAttempts) {
      attempts++;
      logger.info(`[TreasuryConversionService] Polling ${currency} balance (Attempt ${attempts}/${maxAttempts})...`);

      try {
        const balObj = await provider.getMerchantBalance(currency);
        const available = parseFloat(balObj?.available || 0.0);

        if (available >= requiredAmount) {
          logger.info(`[TreasuryConversionService] Balance poll SUCCESS: ${available} >= ${requiredAmount} ${currency}`);
          return available;
        }

        logger.info(`[TreasuryConversionService] Balance poll pending: ${available} < ${requiredAmount} ${currency}. Retrying in ${currentDelay}ms...`);
      } catch (pollErr) {
        logger.warn(`[TreasuryConversionService] Balance poll warning (Attempt ${attempts}): ${pollErr.message}`);
      }

      await new Promise(r => setTimeout(r, currentDelay));
      currentDelay = Math.min(currentDelay * 2, 8000); // Bounded exponential backoff up to 8s max
    }

    throw new Error(`DESTINATION_LIQUIDITY_TIMEOUT: Provider ${currency} destination balance failed to reach ${requiredAmount} within timeout limit.`);
  }
}

module.exports = new TreasuryConversionService();
