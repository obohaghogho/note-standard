const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const env = require("../config/env");
const supabase = require("../config/database");
const logger = require("../utils/logger");
const paymentService = require("../services/payment/paymentService");
const math = require("../utils/mathUtils");

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * Payment Processing Worker
 *
 * Processes queued payment events from BullMQ:
 * - process-grey-webhook: Direct Grey API callbacks
 * - process-brevo-webhook: High-confidence Brevo email matches
 * - process-brevo-unmatched: Low-confidence matches → unmatched queue
 * - process-email-webhook: Legacy email handler
 *
 * All jobs follow idempotency rules and log results.
 */
const worker = new Worker(
  "payment-processing",
  async (job) => {
    const { provider, event, payload, logId } = job.data;
    const txId = event.transactionId;

    logger.info(
      `[PaymentWorker] Processing job ${job.id} (${job.name}) for provider ${provider}`,
      { txId, reference: event.reference, confidence: event.confidence }
    );

    try {
      // ─── 1. Idempotency Check ──────────────────────────────
      if (txId) {
        const { data: existing } = await supabase
          .from("webhook_logs")
          .select("id, processed")
          .eq("provider", provider === "grey" ? "brevo" : provider)
          .eq("unique_transaction_id", txId)
          .neq("id", logId || "00000000-0000-0000-0000-000000000000")
          .maybeSingle();

        if (existing?.processed) {
          logger.warn(
            `[PaymentWorker] Duplicate transaction already processed: ${txId}`
          );
          return { status: "duplicate", txId };
        }
      }

      // ─── 2. Route by Job Type ──────────────────────────────

      // Handle unmatched/low-confidence Brevo emails
      if (job.name === "process-brevo-unmatched") {
        logger.info(
          `[PaymentWorker] Low-confidence match (${event.confidence}%). Moving to unmatched queue.`
        );

        await supabase.from("unmatched_payments").insert({
          amount: event.amount,
          currency: event.currency,
          sender: event.sender,
          raw_text: event.raw,
          metadata: {
            provider,
            txId,
            job_id: job.id,
            confidence: event.confidence,
            reference: event.reference,
            source: "brevo_email",
          },
        });

        if (logId) {
          await supabase
            .from("webhook_logs")
            .update({
              processed: true,
              processing_error: `Low confidence (${event.confidence}%) - moved to unmatched queue`,
            })
            .eq("id", logId);
        }

        return { status: "unmatched", confidence: event.confidence };
      }

      // ─── 3. Reference Matching ─────────────────────────────
      if (!event.reference) {
        logger.warn(
          "[PaymentWorker] No reference found in payload. Moving to unmatched queue."
        );

        await supabase.from("unmatched_payments").insert({
          amount: event.amount,
          currency: event.currency,
          sender: event.sender,
          raw_text: event.raw,
          metadata: { provider, txId, job_id: job.id },
        });

        if (logId) {
          await supabase
            .from("webhook_logs")
            .update({
              processed: true,
              processing_error: "No reference found - moved to unmatched queue",
            })
            .eq("id", logId);
        }

        return { status: "unmatched" };
      }

      // ─── 4. For Brevo emails: Validate against pending payment ─
      if (
        job.name === "process-brevo-webhook" ||
        job.name === "process-email-webhook"
      ) {
        // Find the matching pending payment
        const { data: pendingPayment } = await supabase
          .from("payments")
          .select("*")
          .or(
            `reference.eq.${event.reference},metadata->>user_reference.eq.${event.reference}`
          )
          .eq("status", "pending")
          .maybeSingle();

        if (!pendingPayment) {
          logger.warn(
            `[PaymentWorker] No pending payment found for reference: ${event.reference}`
          );

          await supabase.from("unmatched_payments").insert({
            amount: event.amount,
            currency: event.currency,
            sender: event.sender,
            raw_text: event.raw,
            metadata: {
              provider,
              txId,
              reference: event.reference,
              error: "No pending payment found",
            },
          });

          return { status: "unmatched", error: "No pending payment found" };
        }

        // Check if payment has expired
        if (
          pendingPayment.expires_at &&
          new Date(pendingPayment.expires_at) < new Date()
        ) {
          logger.warn(
            `[PaymentWorker] Payment ${event.reference} has expired.`
          );
          return { status: "expired", reference: event.reference };
        }

        // Validate amount (±1% tolerance for bank transfer rounding)
        if (event.amount && pendingPayment.amount) {
          const expectedAmount = parseFloat(pendingPayment.amount);
          const receivedAmount = parseFloat(event.amount);
          const tolerance = expectedAmount * 0.01; // 1% tolerance

          if (Math.abs(expectedAmount - receivedAmount) > tolerance) {
            logger.error(
              `[PaymentWorker] Amount mismatch for ${event.reference}. Expected: ${expectedAmount}, Received: ${receivedAmount}`
            );

            await supabase.from("unmatched_payments").insert({
              amount: event.amount,
              currency: event.currency,
              sender: event.sender,
              raw_text: event.raw,
              metadata: {
                provider,
                txId,
                reference: event.reference,
                expected_amount: expectedAmount,
                received_amount: receivedAmount,
                error: "Amount mismatch",
              },
            });

            return {
              status: "suspicious",
              error: `Amount mismatch: expected ${expectedAmount}, got ${receivedAmount}`,
            };
          }
        }

        // Update sender name on the payment record
        if (event.sender && event.sender !== "Unknown Sender") {
          await supabase
            .from("payments")
            .update({
              sender_name: event.sender,
              verification_source: "brevo_email",
            })
            .eq("id", pendingPayment.id)
            .catch(() => {});
        }
      }

      // ─── 5. Execute Core Business Logic ────────────────────
      const result = await paymentService.executeWebhookAction(
        event,
        payload,
        provider
      );

      if (result?.error) {
        if (
          result.error.includes("mismatch") ||
          result.error.includes("Verification failed")
        ) {
          await supabase.from("unmatched_payments").insert({
            amount: event.amount,
            currency: event.currency,
            sender: event.sender,
            raw_text: event.raw,
            metadata: {
              provider,
              txId,
              error: result.error,
              reference: event.reference,
            },
          });
          logger.error(
            `[PaymentWorker] Transaction suspicious/mismatched: ${result.error}`
          );
          return { status: "suspicious", error: result.error };
        }
        throw new Error(result.error);
      }

      // ─── 6. Mark as Processed ──────────────────────────────
      if (logId) {
        await supabase
          .from("webhook_logs")
          .update({
            processed: true,
            unique_transaction_id: txId || null,
            processing_error: null,
          })
          .eq("id", logId);
      }

      // Update payment record verification source
      if (event.reference) {
        await supabase
          .from("payments")
          .update({
            verification_source:
              job.name === "process-brevo-webhook"
                ? "brevo_email"
                : "webhook",
            verified_at: new Date().toISOString(),
          })
          .eq("reference", event.reference)
          .catch(() => {});
      }

      logger.info(
        `[PaymentWorker] Job ${job.id} completed successfully for ref: ${event.reference}`
      );
      return { status: "success", result };
    } catch (error) {
      logger.error(
        `[PaymentWorker] Job ${job.id} failed: ${error.message}`
      );

      if (logId) {
        await supabase
          .from("webhook_logs")
          .update({
            processing_error: error.message,
          })
          .eq("id", logId);
      }

      throw error; // Let BullMQ retry
    }
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => {
  logger.info(`[PaymentWorker] Job ${job.id} completed.`);
});

worker.on("failed", (job, err) => {
  logger.error(
    `[PaymentWorker] Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`
  );
});

module.exports = worker;
