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

    // 4. Production-Safe Apple Pay Domain Verification Monitor (DFOS v7.0)
    // Runs every 60 minutes to ensure that Vercel routes are not intercepting/redirecting the association file.
    setInterval(() => {
        const https = require("https");
        const crypto = require("crypto");
        const TARGET_URL = "https://notestandard.com/.well-known/apple-developer-merchantid-domain-association";
        const EXPECTED_HASH = "4e2fdd224e8c281c107b247c5c0ee0292f7c4ce11f9bd9c7c5b1a594dd3199bb";
        
        https.get(TARGET_URL, (res) => {
            const { statusCode } = res;
            
            // 1. Redirect Check
            if (statusCode >= 300 && statusCode < 400) {
                logger.error(
                    `[HEALTH_ALERT] Apple Pay domain association check failed! Redirect introduced (status ${statusCode}). ` +
                    `Location: ${res.headers.location}. Payment infrastructure health: DANGER.`
                );
                return;
            }

            // 2. Status Check
            if (statusCode !== 200) {
                logger.error(
                    `[HEALTH_ALERT] Apple Pay domain verification file is offline or unreachable! ` +
                    `Path: ${TARGET_URL}. Status Code: ${statusCode}. ` +
                    `Payment infrastructure health: DANGER.`
                );
                return;
            }

            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                try {
                    const body = Buffer.concat(chunks);
                    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
                    
                    // 3. Content Modification Check / Middleware Interception Check
                    if (sha256 !== EXPECTED_HASH) {
                        logger.error(
                            `[HEALTH_ALERT] Apple Pay verification file signature mismatch! Content was modified or intercepted! ` +
                            `Expected: ${EXPECTED_HASH}, Got: ${sha256}. ` +
                            `Payment infrastructure health: DANGER.`
                        );
                    } else {
                        logger.info(`[HEALTH_CHECK] Apple Pay domain association integrity verified (SHA256 match).`);
                    }
                } catch (e) {
                    logger.error(`[HEALTH_ALERT] Failed to verify Apple Pay domain verification file signature`, { error: e.message });
                }
            });
        }).on("error", (err) => {
            logger.error(`[HEALTH_ALERT] Apple Pay domain verification health check crashed!`, { error: err.message });
        });
    }, 3600000); // 1 Hour


    logger.info(`[PaymentQueue] Initialized with Redis: ${env.REDIS_URL.split("@").pop()}`);
} else {
    logger.warn('⚠️ Redis disabled (no REDIS_URL) - paymentQueue is inactive');
}

// Ensure exports are safe even if Redis is missing
module.exports = { 
    paymentQueue: paymentQueue || null, 
    connection: redis || null 
};
