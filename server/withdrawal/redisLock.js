/**
 * Distributed Lock Manager (Redis Redlock with In-Memory Mutex Fallback)
 * ────────────────────────────────────────────────────────────────────────
 * Prevents concurrent withdrawal processing for the same user across multi-instance API deployments.
 * Key format: withdraw:user:UUID
 *
 * ⚠️  IMPORTANT: This implementation currently uses an in-memory Map, NOT Redis.
 *     It prevents concurrent withdrawals within a SINGLE Node.js process only.
 *     In a multi-instance deployment (e.g. PM2 cluster, Kubernetes), two instances
 *     can both acquire the "lock" simultaneously. The DB-level SELECT ... FOR UPDATE
 *     in execute_enterprise_withdrawal() is the true serialization barrier.
 *
 *     To upgrade: set REDIS_URL env var and replace Map with ioredis SET NX EX.
 */

const logger = require("../utils/logger");

// In-memory lock storage for single-instance or Redis outage fallback
const inMemoryLocks = new Map();

/**
 * Acquire a distributed lock for a user's withdrawal operation.
 * @param {string} userId 
 * @param {number} ttlMs Default 30,000 ms — must cover provider API call + treasury rebalancing round-trip.
 *                       Previous value of 3,000ms was too short and caused lock expiry mid-flight.
 * @returns {Promise<{ lockId: string, release: Function }>}
 */
async function acquireWithdrawalLock(userId, ttlMs = 30000) {
  const lockKey = `withdraw:user:${userId}`;
  const now = Date.now();

  // Check if lock currently held and active
  if (inMemoryLocks.has(lockKey)) {
    const existing = inMemoryLocks.get(lockKey);
    if (existing.expiresAt > now) {
      const err = new Error(`CONCURRENT_WITHDRAWAL_IN_PROGRESS: A withdrawal is already processing for user ${userId}. Please wait.`);
      err.code = "CONCURRENT_REQUEST";
      throw err;
    }
  }

  const lockId = `lock_${now}_${Math.random().toString(36).substring(2, 9)}`;
  const expiresAt = now + ttlMs;

  inMemoryLocks.set(lockKey, { lockId, expiresAt });

  // Auto cleanup timeout
  const timeout = setTimeout(() => {
    if (inMemoryLocks.get(lockKey)?.lockId === lockId) {
      inMemoryLocks.delete(lockKey);
    }
  }, ttlMs);

  const release = async () => {
    clearTimeout(timeout);
    if (inMemoryLocks.get(lockKey)?.lockId === lockId) {
      inMemoryLocks.delete(lockKey);
      logger.info(`[RedisLock] Released lock for key: ${lockKey}`);
    }
  };

  logger.info(`[RedisLock] Acquired lock for key: ${lockKey} (ID: ${lockId}, TTL: ${ttlMs}ms)`);
  return { lockId, release };
}

function releaseUserLock(userId) {
  const lockKey = `withdraw:user:${userId}`;
  inMemoryLocks.delete(lockKey);
  logger.info(`[RedisLock] Force-released lock for key: ${lockKey}`);
}

/**
 * Acquire a distributed lock for corporate treasury liquidity evaluations & conversions.
 * Prevents concurrent withdrawals from double-spending the same corporate currency pool.
 * Key format: treasury:lock:<provider>:<sourceCurrency>:<destCurrency>
 */
async function acquireCorporateTreasuryLock(provider = "fincra", sourceCurrency, destinationCurrency, ttlMs = 30000) {
  const lockKey = `treasury:lock:${provider}:${sourceCurrency.toUpperCase()}:${destinationCurrency.toUpperCase()}`;
  const now = Date.now();

  if (inMemoryLocks.has(lockKey)) {
    const existing = inMemoryLocks.get(lockKey);
    if (existing.expiresAt > now) {
      const err = new Error(`CONCURRENT_TREASURY_REBALANCING_IN_PROGRESS: A corporate treasury conversion is currently processing for ${sourceCurrency}->${destinationCurrency}. Please retry shortly.`);
      err.code = "CONCURRENT_TREASURY_LOCK";
      throw err;
    }
  }

  const lockId = `lock_treasury_${now}_${Math.random().toString(36).substring(2, 9)}`;
  const expiresAt = now + ttlMs;

  inMemoryLocks.set(lockKey, { lockId, expiresAt });

  const timeout = setTimeout(() => {
    if (inMemoryLocks.get(lockKey)?.lockId === lockId) {
      inMemoryLocks.delete(lockKey);
    }
  }, ttlMs);

  const release = async () => {
    clearTimeout(timeout);
    if (inMemoryLocks.get(lockKey)?.lockId === lockId) {
      inMemoryLocks.delete(lockKey);
      logger.info(`[RedisLock] Released corporate treasury lock for key: ${lockKey}`);
    }
  };

  logger.info(`[RedisLock] Acquired corporate treasury lock for key: ${lockKey} (ID: ${lockId}, TTL: ${ttlMs}ms)`);
  return { lockId, release };
}

module.exports = { acquireWithdrawalLock, releaseUserLock, acquireCorporateTreasuryLock };

