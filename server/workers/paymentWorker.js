const { Worker } = require('bullmq');
const redis = require('../config/redis');
const env = require('../config/env');
const supabase = require('../config/database');
const logger = require('../utils/logger');
const paymentService = require('../services/payment/paymentService');
const { validateJobEnvelope } = require('../services/payment/jobSecurity');
const LockService = require('../services/payment/LockService');

let worker;

if (redis && env.REDIS_URL) {
    worker = new Worker(
        'payment-processing',
        async (job) => {
            // ── 1. MANDATORY: Validate job envelope integrity ──────────────────────
            // Blocks replay, forgery, and duplicate execution before ANY logic runs.
            const validation = await validateJobEnvelope(job.data);

            if (!validation.valid) {
                logger.error('[PaymentWorker] Job rejected — envelope integrity failure', {
                    jobId: job.id,
                    reason: validation.reason
                });

                // Return without throwing — do not retry forged or duplicate jobs
                if (validation.reason === 'IDEMPOTENT_DUPLICATE') {
                    return { status: 'duplicate_blocked' };
                }

                // For signature failures, throw to escalate to failed queue for audit
                throw new Error(`SECURITY_CRITICAL: Job ${job.id} envelope integrity rejected — ${validation.reason}`);
            }

            // ── 2. Operate on validated, clean data (signature fields stripped) ──
            const { provider, event, payload, logId } = validation.data;
            const txId = event?.transactionId;

            logger.info('[PaymentWorker] Processing validated job', {
                jobId: job.id,
                jobName: job.name,
                provider
            });

            try {
                // ── 3. Handle System Jobs (Reconciliation/Maintenance) ────────────────
                if (job.name === "reconciliation-tier-1") {
                    const ReconciliationService = require("../services/payment/ReconciliationService");
                    await ReconciliationService.runSweep({ minAgeMinutes: 3, maxAgeHours: 1, tierLabel: "Tier 1" });
                    return { status: "success" };
                }

                if (job.name === "reconciliation-tier-2") {
                    const ReconciliationService = require("../services/payment/ReconciliationService");
                    await ReconciliationService.runSweep({ minAgeMinutes: 60, maxAgeHours: 24, tierLabel: "Tier 2" });
                    return { status: "success" };
                }

                // ── 4. Reference Matching ──────────────────────────────────────────
                if (!event?.reference) {
                    logger.warn('[PaymentWorker] No reference found — routing to unmatched queue');
                    await supabase.from('unmatched_payments').insert({
                        amount: event?.amount,
                        currency: event?.currency,
                        sender: event?.sender,
                        raw_text: null, // Never store raw text in queue
                        metadata: { provider, txId, job_id: job.id }
                    });
                    return { status: 'unmatched' };
                }

                // ── 4. Execute Business Logic (Wrapped in Mutex) ─────────────
                const lockKey = txId || event.reference;
                const result = await LockService.withLock(lockKey, async () => {
                   // ── Task 7: Re-check idempotency inside the lock ──────────
                   const { data: alreadyProcessed } = await supabase
                     .from("webhook_events")
                     .select("id")
                     .eq("event_id", lockKey)
                     .maybeSingle();

                   if (alreadyProcessed && txId) {
                     logger.info(`[PaymentWorker] Mutex Win: Event ${lockKey} already processed inside lock.`);
                     return { status: "already_completed" };
                   }

                   return await paymentService.executeWebhookAction(event, payload, provider);
                }, { ttl: 30000, retryWindow: 5000 });

                if (result?.error) {
                    logger.error('[PaymentWorker] Business logic failure', { jobId: job.id });
                    throw new Error(result.error);
                }

                // ── 5. Mark webhook log as processed ──────────────────────────────
                if (logId) {
                    await supabase
                        .from('webhook_logs')
                        .update({ processed: true, unique_transaction_id: txId || null })
                        .eq('id', logId);
                }

                logger.info('[PaymentWorker] Job completed successfully', { jobId: job.id });
                return { status: 'success' };

            } catch (err) {
                logger.error('[PaymentWorker] Job execution failure', { jobId: job.id, error: err.message });

                if (logId) {
                    await supabase.from('webhook_logs')
                        .update({ processing_error: err.message })
                        .eq('id', logId);
                }

                throw err; // Let BullMQ retry with backoff
            }
        },
        { connection: redis, concurrency: 5 }
    );

    worker.on('ready', () => {
        logger.info('[Queue Worker Active] Worker is online and bound to Redis queue');
    });

    worker.on('completed', (job) => {
        logger.info('[PaymentWorker] Job completed', { jobId: job.id });
    });

    worker.on('failed', (job, err) => {
        logger.error('[PaymentWorker] Job permanently failed', {
            jobId: job?.id,
            attempts: job?.attemptsMade,
            error: err.message
        });
    });

} else {
    logger.warn('[PaymentWorker] Redis unavailable — worker inactive');
}

module.exports = worker || { on: () => {}, close: () => Promise.resolve() };
