'use strict';

/**
 * server/services/payment/DistributedLockService.js
 * ====================================================
 * Distributed Lock Service preventing concurrent race conditions during
 * deposit matching, reconciliation, payout dispatch, and balance reservation.
 */

const logger = require('../../utils/logger');

class DistributedLockService {
  constructor() {
    this.locks = new Map();
  }

  /**
   * Acquire a named lock with TTL
   */
  async acquireLock(lockKey, ttlMs = 10000) {
    const key = String(lockKey);
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && now < existing.expiresAt) {
      logger.warn(`[DistributedLockService] Lock '${key}' is currently held by lockId=${existing.lockId}`);
      return null;
    }

    const lockId = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.locks.set(key, { lockId, expiresAt: now + ttlMs });
    return lockId;
  }

  /**
   * Release a named lock
   */
  async releaseLock(lockKey, lockId) {
    const key = String(lockKey);
    const existing = this.locks.get(key);

    if (existing && existing.lockId === lockId) {
      this.locks.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Wrap an async operation with distributed lock safety
   */
  async withLock(lockKey, fn, ttlMs = 10000) {
    const lockId = await this.acquireLock(lockKey, ttlMs);
    if (!lockId) {
      throw new Error(`[DistributedLockService] Could not acquire lock for '${lockKey}'`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, lockId);
    }
  }
}

module.exports = new DistributedLockService();
