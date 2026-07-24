/**
 * IdempotencyGuard.js
 * ===================
 * Universal idempotency key enforcement for all financial actions.
 * Prevents duplicate charges if a client retries or a webhook is delivered twice.
 *
 * Storage: Redis (primary) → In-memory (fallback when Redis unavailable)
 * TTL: 24 hours for all keys
 *
 * NoteStandard Financial Platform v4
 */

const logger = require('../../utils/logger');

let redis;
try { redis = require('../../config/redis'); } catch (_) { redis = null; }

// In-memory fallback store (for environments without Redis)
const _memStore = new Map();
const MEM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class IdempotencyGuard {
  /**
   * Checks if an idempotency key has already been processed.
   * Returns the stored result if so; otherwise marks it as in-flight.
   *
   * @param {string} key   - The idempotency key
   * @param {string} scope - Prefix/namespace e.g. 'payment', 'refund', 'wallet'
   * @returns {Promise<{ duplicate: boolean, result: any | null }>}
   */
  async check(key, scope = 'payment') {
    const redisKey = `idempotency:${scope}:${key}`;

    // Redis path
    if (redis) {
      try {
        const existing = await redis.get(redisKey);
        if (existing) {
          logger.info(`[IdempotencyGuard] Duplicate detected (Redis): ${redisKey}`);
          return { duplicate: true, result: JSON.parse(existing) };
        }
        return { duplicate: false, result: null };
      } catch (err) {
        logger.warn(`[IdempotencyGuard] Redis check failed, falling back to memory: ${err.message}`);
      }
    }

    // Memory fallback
    const entry = _memStore.get(redisKey);
    if (entry && Date.now() - entry.ts < MEM_TTL_MS) {
      logger.info(`[IdempotencyGuard] Duplicate detected (memory): ${redisKey}`);
      return { duplicate: true, result: entry.result };
    }
    return { duplicate: false, result: null };
  }

  /**
   * Marks a key as processed and stores its result for future duplicate checks.
   *
   * @param {string} key
   * @param {string} scope
   * @param {any}    result  - The result to return on duplicate detection
   * @param {number} [ttlSeconds=86400]
   */
  async commit(key, scope = 'payment', result = {}, ttlSeconds = 86400) {
    const redisKey = `idempotency:${scope}:${key}`;
    const serialised = JSON.stringify(result);

    if (redis) {
      try {
        await redis.set(redisKey, serialised, 'EX', ttlSeconds);
        return;
      } catch (err) {
        logger.warn(`[IdempotencyGuard] Redis commit failed, falling back to memory: ${err.message}`);
      }
    }

    _memStore.set(redisKey, { result, ts: Date.now() });
  }

  /**
   * Convenience wrapper: run `fn` only if the key is fresh.
   * If duplicate, returns the stored result immediately.
   *
   * @param {string}   key
   * @param {string}   scope
   * @param {Function} fn   - async function() that returns the result
   * @returns {Promise<{ result: any, wasDuplicate: boolean }>}
   */
  async guard(key, scope, fn) {
    const { duplicate, result } = await this.check(key, scope);
    if (duplicate) {
      return { result, wasDuplicate: true };
    }
    const freshResult = await fn();
    await this.commit(key, scope, freshResult);
    return { result: freshResult, wasDuplicate: false };
  }
}

module.exports = new IdempotencyGuard();
