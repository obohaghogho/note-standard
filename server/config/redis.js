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

if (process.env.REDIS_URL) {
    try {
        redisClient = new IORedis(process.env.REDIS_URL, {
            maxRetriesPerRequest: null,
            tls: { rejectUnauthorized: false },
            // Reconnect logic for stability
            retryStrategy: (times) => {
                const delay = Math.min(times * 100, 3000);
                return delay;
            }
        });

        redisClient.on("error", (err) => {
            logger.error("[Redis] Shared Connection Error", { error: err.message });
        });

        redisClient.on("connect", () => {
            logger.info(`[Redis] Shared Connection Established`);
        });

    } catch (err) {
        logger.error("[Redis] Critical Initialization Failure", { error: err.message });
    }
} else {
    logger.warn("[Redis] REDIS_URL missing. Security replay protection will be disabled.");
}

module.exports = redisClient;
