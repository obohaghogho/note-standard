const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const env = require("../../config/env");
const logger = require("../../utils/logger");

const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

const paymentQueue = new Queue("payment-processing", {
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

module.exports = { paymentQueue, connection };
