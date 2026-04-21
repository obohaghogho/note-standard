const { Queue } = require("bullmq");
const redis = require("../../config/redis");
const env = require("../../config/env");
const logger = require("../../utils/logger");

let paymentQueue;

if (redis && env.REDIS_URL) {
    paymentQueue = new Queue("payment-processing", {
        connection: redis,
        defaultJobOptions: {
            attempts: 5,
            backoff: {
                type: "exponential",
                delay: 1000,
            },
            removeOnComplete: true,
            removeOnFail: 1000, // Keep last 1000 failures for debugging
        },
    });

    // 1. Queue Health: Ping Redis specifically on startup
    redis.ping().then(() => {
        logger.info("[Queue Connected] Redis reachable (Queue Booted)");
    }).catch(err => {
        logger.error("[Queue Connected] Redis ping failed during Queue boot", { error: err.message });
    });

    // 2. Queue Depth Monitoring: Pulse every 30 seconds
    setInterval(async () => {
        const SystemState = require("../../config/SystemState");
        try {
            const count = await paymentQueue.count();
            logger.info("[Queue Depth]", { count });

            const MAX_QUEUE_THRESHOLD = 1000;
            if (count > MAX_QUEUE_THRESHOLD) {
                logger.error("[QUEUE_OVERFLOW] System entering SAFE MODE");
                SystemState.enterSafeMode("Queue capacity breached threshold.");
            }
        } catch (e) {
            logger.error("[Queue Depth] Failed to read queue count", { error: e.message });
        }
    }, 30000);

    // 3. Schedule Deterministic Reconciliation Sweeps (Hardenend v1.74)
    paymentQueue.add("reconciliation-tier-1", {}, {
        repeat: { cron: "*/3 * * * *" }, // Every 3 minutes
        jobId: "reconciliation-tier-1-repeat" 
    }).catch(err => logger.error("[Queue] Failed to schedule Tier 1 reconciliation", { error: err.message }));

    paymentQueue.add("reconciliation-tier-2", {}, {
        repeat: { cron: "0 * * * *" }, // Every hour (Tier 2 Deep Sweep)
        jobId: "reconciliation-tier-2-repeat"
    }).catch(err => logger.error("[Queue] Failed to schedule Tier 2 reconciliation", { error: err.message }));

    logger.info(`[PaymentQueue] Initialized with Redis: ${env.REDIS_URL.split("@").pop()}`);
} else {
    logger.warn('⚠️ Redis disabled (no REDIS_URL) - paymentQueue is inactive');
}

// Ensure exports are safe even if Redis is missing
module.exports = { 
    paymentQueue: paymentQueue || null, 
    connection: redis || null 
};
