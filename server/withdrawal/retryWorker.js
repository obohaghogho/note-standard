/**
 * Exponential Backoff Payout Retry Worker
 * ─────────────────────────────────────────
 * Automatically retries transient network / 5xx failures using exponential backoff.
 * Non-retryable errors (invalid account, invalid bank, insufficient merchant balance) bypass retry.
 * Exceeding max retries routes the transaction to the Dead Letter Queue (DLQ).
 */

const supabase       = require("../config/database");
const { registry }   = require("../providers/PayoutProvider");
const { enqueueToDLQ } = require("./deadLetterQueue");
const logger         = require("../utils/logger");

const NON_RETRYABLE_CODES = [
  "INVALID_ACCOUNT",
  "INVALID_BANK",
  "INSUFFICIENT_MERCHANT_BALANCE",
  "ACCOUNT_NAME_MISMATCH",
  "ACCOUNT_DISABLED",
];

class PayoutRetryWorker {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
  }

  start(intervalMs = 30000) { // Poll every 30 seconds
    if (this.intervalId) return;
    logger.info("[RetryWorker] 🔄 Enterprise Payout Retry Worker started.");
    this.intervalId = setInterval(() => this.processPendingRetries(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("[RetryWorker] Stopped.");
    }
  }

  async processPendingRetries() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date().toISOString();
      const { data: queueItems, error } = await supabase
        .from("withdrawal_retry_queue")
        .select("*")
        .eq("status", "PENDING")
        .lte("next_retry_at", now)
        .limit(10);

      if (error || !queueItems || queueItems.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.info(`[RetryWorker] Processing ${queueItems.length} retry queue items...`);

      for (const item of queueItems) {
        await this.retrySinglePayout(item);
      }
    } catch (err) {
      logger.error(`[RetryWorker] Exception during retry queue processing: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  async retrySinglePayout(item) {
    const { id, transaction_reference, payload, retry_count, max_retries } = item;

    // Check if max retries exceeded -> Move to DLQ
    if (retry_count >= max_retries) {
      logger.warn(`[RetryWorker] Transaction ${transaction_reference} exceeded max retries (${max_retries}). Moving to DLQ.`);
      await supabase.from("withdrawal_retry_queue").update({ status: "EXHAUSTED" }).eq("id", id);
      await enqueueToDLQ({
        transactionRef: transaction_reference,
        userId: payload.userId,
        payload,
        reason: item.last_error || "Max retry limit reached",
        totalRetries: retry_count,
      });
      return;
    }

    try {
      await supabase.from("withdrawal_retry_queue").update({ status: "PROCESSING" }).eq("id", id);

      const provider = registry.getPrimary();
      const res = await provider.initiatePayout(payload);

      logger.info(`[RetryWorker] ✅ Retry succeeded for ${transaction_reference}. Fincra Ref: ${res.fincraReference}`);

      await supabase.from("withdrawal_retry_queue").update({ status: "COMPLETED" }).eq("id", id);
      await supabase
        .from("fincra_transactions")
        .update({ status: "PROCESSING", fincra_reference: res.fincraReference })
        .eq("reference", transaction_reference);

    } catch (err) {
      const nextRetryCount = retry_count + 1;
      const isPermanent = NON_RETRYABLE_CODES.some(c => String(err.message).toUpperCase().includes(c));

      if (isPermanent || nextRetryCount >= max_retries) {
        logger.error(`[RetryWorker] Permanent/Max error for ${transaction_reference}: ${err.message}. Moving to DLQ.`);
        await supabase.from("withdrawal_retry_queue").update({ status: "EXHAUSTED", last_error: err.message }).eq("id", id);
        await enqueueToDLQ({
          transactionRef: transaction_reference,
          userId: payload.userId,
          payload,
          reason: err.message,
          totalRetries: nextRetryCount,
        });

        // Trigger balance reversal RPC
        await supabase.rpc("finalize_enterprise_withdrawal", {
          p_withdrawal_ref: transaction_reference,
          p_fincra_ref: null,
          p_status: "REVERSED",
          p_error_code: "RETRY_FAILED_PERMANENT",
          p_error_message: err.message,
        });
      } else {
        // Calculate exponential backoff delay (60s * 2^retry_count)
        const delaySeconds = Math.min(3600, 60 * Math.pow(2, nextRetryCount));
        const nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

        logger.warn(`[RetryWorker] Transient error for ${transaction_reference}. Retrying in ${delaySeconds}s (Attempt ${nextRetryCount}/${max_retries})`);

        await supabase.from("withdrawal_retry_queue").update({
          status: "PENDING",
          retry_count: nextRetryCount,
          last_error: err.message,
          next_retry_at: nextRetryAt,
        }).eq("id", id);
      }
    }
  }
}

module.exports = new PayoutRetryWorker();
