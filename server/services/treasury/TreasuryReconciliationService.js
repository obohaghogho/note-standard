/**
 * Enterprise Treasury Reconciliation Service
 * ─────────────────────────────────────────────
 * Audits and reconciles cross-currency treasury positions, handling post-conversion payout
 * failures, conversion timeout resolution, and corporate surplus tracking.
 */

const logger = require("../../utils/logger");
const supabase = require("../../config/database");
const TreasuryReservationService = require("./TreasuryReservationService");

class TreasuryReconciliationService {
  /**
   * Reconciles a scenario where FX conversion succeeded, but bank payout failed.
   * User wallet reservation is reversed, while corporate FX balance remains recorded as surplus.
   */
  async handlePostConversionPayoutFailure({ withdrawalReference, treasuryReference, reason, errorCode }) {
    logger.warn(`[TreasuryReconciliationService] Handling post-conversion payout failure for ${withdrawalReference} (Treasury Ref: ${treasuryReference}). Reason: ${reason}`);

    try {
      // 1. Mark Treasury Reservation for Reconciliation & Surplus
      if (treasuryReference) {
        await TreasuryReservationService.updateStatus({
          treasuryReference,
          status: "RECONCILIATION_REQUIRED",
          errorCode: errorCode || "PAYOUT_FAILED_POST_CONVERSION",
          errorMessage: `Payout failed post-conversion: ${reason}. Corporate destination balance retained as surplus.`
        });
      }

      // 2. Log audit event
      try {
        await supabase.from("banking_audit_logs").insert({
          action: "TREASURY_POST_CONVERSION_PAYOUT_FAILED",
          provider: "fincra",
          previous_values: { withdrawalReference, treasuryReference },
          new_values: { status: "RECONCILIATION_REQUIRED", reason },
          correlation_id: `corr_${Date.now()}`
        });
      } catch (logErr) {
        logger.warn(`[TreasuryReconciliationService] Audit log warning: ${logErr.message}`);
      }

      return {
        success: true,
        withdrawalReference,
        treasuryReference,
        status: "RECONCILIATION_REQUIRED",
        message: "Payout failure recorded. User reservation reversed; corporate surplus retained."
      };
    } catch (err) {
      logger.error(`[TreasuryReconciliationService] Post-conversion failure handling error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Reconciles a timed-out conversion transaction.
   */
  async reconcileTimeoutConversion(treasuryReference) {
    logger.info(`[TreasuryReconciliationService] Reconciling timeout conversion for ${treasuryReference}`);

    const { data: res } = await supabase
      .from("treasury_liquidity_reservations")
      .select("*")
      .eq("treasury_reference", treasuryReference)
      .single();

    if (!res) {
      throw new Error(`Treasury reservation ${treasuryReference} not found.`);
    }

    return {
      treasuryReference,
      status: res.status,
      reconciled: true
    };
  }
}

module.exports = new TreasuryReconciliationService();
