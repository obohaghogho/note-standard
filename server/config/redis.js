const IORedis = require("ioredis");
const logger = require("../utils/logger");

/**
 * Centralized Redis Connection (Fintech Hardened)
 * This connection is shared across:
 * 1. SecurityMonitor (Lockouts)
 * 2. EventSigner (Replay Protection)
 * 3. PaymentQueue (BullMQ)
 */
let redisClient = null;

if (process.env.REDIS_URL && process.env.DISABLE_REDIS !== 'true') {
    try {
        redisClient = new IORedis(process.env.REDIS_URL, {
            maxRetriesPerRequest: null,
            tls: { rejectUnauthorized: false },
            // Reconnect logic for stability with quota limit safety
            retryStrategy: (times) => {
                if (redisClient && redisClient.quotaExceeded) {
                    // Upstash quota exceeded: retry every 60s to avoid CPU/connection burn
                    return 60000;
                }
                const delay = Math.min(times * 500, 5000);
                return delay;
            }
        });

        redisClient.quotaExceeded = false;

        redisClient.on("error", (err) => {
            if (err.message && err.message.includes("max requests limit exceeded")) {
                if (!redisClient.quotaExceeded) {
                    redisClient.quotaExceeded = true;
                    logger.warn("[Redis] ⚠️ Upstash Redis quota limit exceeded (500,000 requests limit breached). Replay protection and Redis background queues will be temporarily bypassed until reset.");
                }
                return;
            }
            logger.error("[Redis] Shared Connection Error", { error: err.message });
        });

        redisClient.on("connect", () => {
            redisClient.quotaExceeded = false;
            logger.info(`[Redis] Shared Connection Established`);
        });

    } catch (err) {
        logger.error("[Redis] Critical Initialization Failure", { error: err.message });
    }
} else {
    logger.warn("[Redis] REDIS_URL missing. Security replay protection will be disabled.");
}

module.exports = redisClient;
