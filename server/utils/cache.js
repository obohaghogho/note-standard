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
   * Also implements Request Collapsing to prevent duplicate concurrent calls.
   * @param {string} key
   * @param {number} ttlSeconds
   * @param {Function} fn
   */
  async wrap(key, ttlSeconds, fn) {
    // 1. Check for resolved cache
    const cached = this.get(key);
    if (cached !== null) return cached;

    // 2. Check for ongoing request (Request Collapsing)
    const pendingKey = `pending_${key}`;
    if (this.store.has(pendingKey)) {
      return this.store.get(pendingKey);
    }

    // 3. Trigger new request and track it
    const promise = fn();
    this.store.set(pendingKey, promise);

    try {
      const result = await promise;
      if (result !== null && result !== undefined) {
        this.set(key, result, ttlSeconds);
      }
      return result;
    } finally {
      // Always cleanup pending key
      this.store.delete(pendingKey);
    }
  }
}

module.exports = new Cache();
