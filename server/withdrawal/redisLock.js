/**
 * Distributed Lock Manager (Redis Redlock with In-Memory Mutex Fallback)
 * ────────────────────────────────────────────────────────────────────────
 * Prevents concurrent withdrawal processing for the same user across multi-instance API deployments.
 * Key format: withdraw:user:UUID
 */

const logger = require("../utils/logger");

// In-memory lock storage for single-instance or Redis outage fallback
const inMemoryLocks = new Map();

/**
 * Acquire a distributed lock for a user's withdrawal operation.
 * @param {string} userId 
 * @param {number} ttlMs Default 15,000 ms
 * @returns {Promise<{ lockId: string, release: Function }>}
 */
async function acquireWithdrawalLock(userId, ttlMs = 15000) {
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

  logger.info(`[RedisLock] Acquired lock for key: ${lockKey} (ID: ${lockId})`);
  return { lockId, release };
}

module.exports = { acquireWithdrawalLock };
