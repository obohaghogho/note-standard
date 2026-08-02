'use strict';

/**
 * CircuitBreakerService.js
 * =========================
 * Enterprise Circuit Breaker Service for Provider Adapters.
 * Manages state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED),
 * recovery timeouts, half-open probing, and operational counters.
 */
class CircuitBreakerService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    this.breakers = new Map();
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs || 60000;
    this.halfOpenProbesNeeded = options.halfOpenProbesNeeded || 3;

    this.initDefaultBreakers();
  }

  initDefaultBreakers() {
    ['fincra', 'anchor', 'conduit'].forEach(provider => {
      this.breakers.set(provider, {
        provider,
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timeouts: 0,
        rejections: 0,
        trippedAt: null,
        recoveryAt: null
      });
    });
  }

  getBreaker(provider) {
    let cb = this.breakers.get(provider.toLowerCase());
    if (!cb) {
      cb = {
        provider: provider.toLowerCase(),
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timeouts: 0,
        rejections: 0,
        trippedAt: null,
        recoveryAt: null
      };
      this.breakers.set(provider.toLowerCase(), cb);
    }
    return cb;
  }

  /**
   * Execute request through Circuit Breaker wrapper
   */
  async execute(provider, requestFn) {
    const cb = this.getBreaker(provider);

    // 1. Check if state is OPEN and check for recovery timeout -> HALF_OPEN
    if (cb.state === 'OPEN') {
      const now = Date.now();
      if (cb.recoveryAt && now >= cb.recoveryAt) {
        cb.state = 'HALF_OPEN';
        cb.consecutiveSuccesses = 0;
      } else {
        cb.rejections++;
        throw new Error(`CIRCUIT_BREAKER_OPEN: Provider '${provider}' circuit is OPEN. Requests are blocked.`);
      }
    }

    // 2. Execute Request
    try {
      const result = await requestFn();
      this.recordSuccess(provider);
      return result;
    } catch (err) {
      this.recordFailure(provider, err);
      throw err;
    }
  }

  /**
   * Record Successful Execution
   */
  recordSuccess(provider) {
    const cb = this.getBreaker(provider);
    cb.successfulRequests++;
    cb.consecutiveFailures = 0;

    if (cb.state === 'HALF_OPEN') {
      cb.consecutiveSuccesses++;
      if (cb.consecutiveSuccesses >= this.halfOpenProbesNeeded) {
        cb.state = 'CLOSED';
        cb.trippedAt = null;
        cb.recoveryAt = null;
      }
    }
  }

  /**
   * Record Failed Execution
   */
  recordFailure(provider, error) {
    const cb = this.getBreaker(provider);
    cb.failedRequests++;
    cb.consecutiveFailures++;
    cb.consecutiveSuccesses = 0;

    if (error && error.message && error.message.includes('TIMEOUT')) {
      cb.timeouts++;
    }

    if (cb.state === 'CLOSED' && cb.consecutiveFailures >= this.failureThreshold) {
      cb.state = 'OPEN';
      cb.trippedAt = Date.now();
      cb.recoveryAt = Date.now() + this.recoveryTimeoutMs;
    } else if (cb.state === 'HALF_OPEN') {
      cb.state = 'OPEN';
      cb.trippedAt = Date.now();
      cb.recoveryAt = Date.now() + this.recoveryTimeoutMs;
    }
  }
}

module.exports = CircuitBreakerService;
