const logger = require("./logger");

/**
 * Universal Cache Utility
 * Supports in-memory storage with TTL (Time To Live).
 * Designed to be easily swapped for Redis if needed.
 */
class Cache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Set a value in cache
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds - Time to live in seconds
   */
  set(key, value, ttlSeconds = 30) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Get a value from cache
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const data = this.store.get(key);
    if (!data) return null;

    if (Date.now() > data.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return data.value;
  }

  /**
   * Delete a key
   * @param {string} key
   */
  del(key) {
    this.store.delete(key);
  }

  /**
   * Flush all cache
   */
  flush() {
    this.store.clear();
    logger.info("[Cache] Store flushed");
  }

  /**
   * Helper to wrap async functions with caching
   * @param {string} key
   * @param {number} ttlSeconds
   * @param {Function} fn
   */
  async wrap(key, ttlSeconds, fn) {
    const cached = this.get(key);
    if (cached !== null) return cached;

    const result = await fn();
    if (result !== null && result !== undefined) {
      this.set(key, result, ttlSeconds);
    }
    return result;
  }
}

module.exports = new Cache();
