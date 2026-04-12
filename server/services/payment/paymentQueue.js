const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const env = require("../../config/env");
const logger = require("../../utils/logger");

let connection;
let paymentQueue;

if (env.REDIS_URL) {
    connection = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        tls: { rejectUnauthorized: false }
    });

    paymentQueue = new Queue("payment-processing", {
        connection,
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

    logger.info(`[PaymentQueue] Initialized with Redis: ${env.REDIS_URL.split("@").pop()}`);
} else {
    logger.warn('⚠️ Redis disabled (no REDIS_URL) - paymentQueue is inactive');
}

// Ensure exports are safe even if Redis is missing
module.exports = { 
    paymentQueue: paymentQueue || null, 
    connection: connection || null 
};
