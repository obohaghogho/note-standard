/**
 * Circuit Breaker Manager for Payment Providers
 * ───────────────────────────────────────────────
 * Prevents cascade failures when an external provider experiences downtime.
 * States:
 *   CLOSED    : Normal operation
 *   OPEN      : Provider outage detected; requests blocked or failed over
 *   HALF_OPEN : Testing provider recovery
 */

const logger = require("../utils/logger");

const STATES = Object.freeze({
  CLOSED:    "CLOSED",
  OPEN:      "OPEN",
  HALF_OPEN: "HALF_OPEN",
});

class CircuitBreaker {
  constructor(failureThreshold = 5, coolOffMs = 60000) {
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.coolOffMs = coolOffMs;
    this.nextAttempt = Date.now();
  }

  canExecute() {
    if (this.state === STATES.CLOSED) return true;
    if (this.state === STATES.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        this.state = STATES.HALF_OPEN;
        logger.info("[CircuitBreaker] Transitioning from OPEN to HALF_OPEN (probing provider)");
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN
  }

  recordSuccess() {
    this.failureCount = 0;
    if (this.state !== STATES.CLOSED) {
      logger.info("[CircuitBreaker] Provider recovered. Circuit CLOSED.");
      this.state = STATES.CLOSED;
    }
  }

  recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = STATES.OPEN;
      this.nextAttempt = Date.now() + this.coolOffMs;
      logger.error(`[CircuitBreaker] 🚨 Threshold reached (${this.failureCount}/${this.failureThreshold}). Circuit OPEN for ${this.coolOffMs / 1000}s.`);
    }
  }
}

module.exports = { CircuitBreaker, STATES };
