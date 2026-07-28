/**
 * Dead Letter Queue (DLQ) Manager
 * ────────────────────────────────
 * Stores payout requests that have exhausted maximum retries for manual admin review.
 */

const supabase = require("../config/database");
const logger   = require("../utils/logger");

/**
 * Enqueue a failed transaction to DLQ.
 */
async function enqueueToDLQ({ transactionRef, userId, payload = {}, reason = "Max retries exceeded", totalRetries = 5 }) {
  try {
    const { error } = await supabase.from("withdrawal_dlq").insert({
      transaction_reference: transactionRef,
      user_id:               userId,
      payload,
      failure_reason:        reason,
      total_retries:         totalRetries,
      resolved:              false,
      created_at:            new Date().toISOString(),
    });

    if (error) {
      logger.error(`[DLQ] Failed to insert transaction ${transactionRef} into DLQ: ${error.message}`);
    } else {
      logger.warn(`[DLQ] ⚠️ Transaction ${transactionRef} moved to Dead Letter Queue (DLQ). Reason: ${reason}`);
    }
  } catch (err) {
    logger.error(`[DLQ] Exception enqueuing transaction ${transactionRef}: ${err.message}`);
  }
}

/**
 * Fetch unresolved DLQ entries for Admin Dashboard.
 */
async function getUnresolvedDLQEntries() {
  const { data, error } = await supabase
    .from("withdrawal_dlq")
    .select("*, profile:profiles(email, full_name)")
    .eq("resolved", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

module.exports = { enqueueToDLQ, getUnresolvedDLQEntries };
