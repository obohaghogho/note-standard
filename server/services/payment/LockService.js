const { v4: uuidv4 } = require('uuid');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * LockService - Institutional-Grade Distributed Mutex
 * Implements Living Lease Pattern with Heartbeat and Token Validation
 */
class LockService {
    /**
     * Acquire a lease on an entity
     * Uses atomic SET NX PX to prevent race conditions
     */
    async acquire(key, ttlMs = 30000) {
        if (!redis) return { success: true, token: 'redis_disabled' };

        const token = uuidv4();
        const lockKey = `lock:payment:${key}`;
        
        // Atomic Acquire: SET NX PX
        const result = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
        
        if (result === 'OK') {
            return { success: true, token, key: lockKey };
        }
        
        return { success: false };
    }

    /**
     * Heartbeat Extension (Atomic)
     * Verifies ownership token before extending TTL
     */
    async extend(lockKey, token, ttlMs = 30000) {
        if (!redis || token === 'redis_disabled') return true;

        const lua = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("pexpire", KEYS[1], ARGV[2])
            else
                return 0
            end
        `;
        
        const result = await redis.eval(lua, 1, lockKey, token, ttlMs);
        return result === 1;
    }

    /**
     * atomic Release
     * Verifies ownership token before deleting key
     */
    async release(lockKey, token) {
        if (!redis || token === 'redis_disabled') return true;

        const lua = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;

        const result = await redis.eval(lua, 1, lockKey, token);
        if (result !== 1) {
            logger.warn(`[LockService] Failed to release lock or not owner`, { lockKey });
        }
        return result === 1;
    }

    /**
     * Wrapper for lock-guaranteed execution
     * Includes heartbeat and backoff retry logic
     */
    async withLock(entityId, fn, options = {}) {
        const { 
            ttl = 30000, 
            retryWindow = 5000, 
            maxExecution = 90000 
        } = options;

        const startTime = Date.now();
        let acquired = null;
        let attempts = 0;

        // 1. Acquisition with Exponential Backoff
        while (Date.now() - startTime < retryWindow) {
            acquired = await this.acquire(entityId, ttl);
            if (acquired.success) break;
            
            attempts++;
            const backoff = Math.min(50 * Math.pow(2, attempts), 500); // 50ms -> 100ms -> ... up to 500ms
            await new Promise(r => setTimeout(r, backoff));
        }

        if (!acquired || !acquired.success) {
            throw new Error(`LOCK_TIMEOUT: Could not acquire lock for entity ${entityId} after ${retryWindow}ms`);
        }

        const { token, key } = acquired;
        let heartbeatInterval = null;
        let executionTimeout = null;

        try {
            // 2. Start Heartbeat (every 10s)
            heartbeatInterval = setInterval(async () => {
                const refreshed = await this.extend(key, token, ttl);
                if (!refreshed) {
                    logger.error(`[LockService] Heartbeat failed - Ownership lost for ${entityId}`);
                    // Critical: The worker should ideally stop, but we at least log it.
                }
            }, 10000);

            // 3. Start hard execution ceiling (90s)
            const executionPromise = fn();
            const timeoutPromise = new Promise((_, reject) => {
                executionTimeout = setTimeout(() => {
                    reject(new Error(`EXECUTION_CEILING_REACHED: Job for ${entityId} exceeded ${maxExecution}ms`));
                }, maxExecution);
            });

            return await Promise.race([executionPromise, timeoutPromise]);

        } finally {
            // 4. Cleanup
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            if (executionTimeout) clearTimeout(executionTimeout);
            await this.release(key, token);
        }
    }
}

module.exports = new LockService();
