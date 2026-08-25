const { v4: uuidv4 } = require('uuid');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * LockService - Institutional-Grade Distributed Mutex
 * Implements Living Lease Pattern with Heartbeat and Token Validation
 * 
 * DEGRADATION STRATEGY (v2 — Post-Audit Fix):
 *   When Redis is unavailable, we NO LONGER silently bypass locking.
 *   Instead, the DepositCreditEngine uses SELECT … FOR UPDATE at the DB level
 *   for row-level locking (inside confirm_deposit_v7 RPC). This LockService
 *   now logs a clear warning when degraded so operators are alerted, but the
 *   system remains safe because the DB-level lock is the true safety net.
 */
class LockService {
    /**
     * Acquire a lease on an entity
     * Uses atomic SET NX PX to prevent race conditions
     */
    async acquire(key, ttlMs = 30000) {
        if (!redis) return { success: true, token: 'redis_disabled', degradedMode: true };

        const token = uuidv4();
        const lockKey = `lock:payment:${key}`;
        
        try {
            // Atomic Acquire: SET NX PX
            const result = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
            
            if (result === 'OK') {
                return { success: true, token, key: lockKey };
            }
            
            return { success: false };
        } catch (err) {
            logger.warn(`[LockService] Redis connection error during acquire. DB-level locks will protect against race conditions.`, { error: err.message });
            return { success: true, token: 'redis_degraded', degradedMode: true };
        }
    }

    /**
     * Heartbeat Extension (Atomic)
     * Verifies ownership token before extending TTL
     */
    async extend(lockKey, token, ttlMs = 30000) {
        if (!redis || token === 'redis_disabled' || token === 'redis_degraded') return true;

        try {
            const lua = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("pexpire", KEYS[1], ARGV[2])
                else
                    return 0
                end
            `;
            
            const result = await redis.eval(lua, 1, lockKey, token, ttlMs);
            return result === 1;
        } catch (err) {
            logger.warn(`[LockService] Redis connection error during extend:`, { error: err.message });
            return true;
        }
    }

    /**
     * Atomic Release
     * Verifies ownership token before deleting key
     */
    async release(lockKey, token) {
        if (!redis || token === 'redis_disabled' || token === 'redis_degraded') return true;

        try {
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
        } catch (err) {
            logger.warn(`[LockService] Redis connection error during release:`, { error: err.message });
            return true;
        }
    }

    /**
     * Wrapper for lock-guaranteed execution
     * Includes heartbeat and backoff retry logic
     * 
     * SAFETY NOTE (Post-Audit Fix):
     *   When Redis is degraded, we proceed with a warning instead of throwing.
     *   The true concurrency safety comes from the confirm_deposit_v7 RPC's
     *   SELECT … FOR UPDATE at the database level. The Redis lock is an
     *   optimization layer (fast rejection of duplicates), NOT the safety layer.
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
            if (acquired.success || acquired.degradedMode) break;
            
            attempts++;
            const backoff = Math.min(50 * Math.pow(2, attempts), 500);
            await new Promise(r => setTimeout(r, backoff));
        }

        // If Redis failed completely (degraded mode), proceed with DB-level safety
        // The DepositCreditEngine's confirm_deposit_v7 RPC uses SELECT … FOR UPDATE
        // which provides row-level locking at the database level regardless of Redis.
        if (acquired && acquired.degradedMode) {
            logger.warn(`[LockService] Redis degraded for ${entityId}. Proceeding with DB-level locking only (SELECT … FOR UPDATE in confirm_deposit_v7).`);
            return await fn();
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
