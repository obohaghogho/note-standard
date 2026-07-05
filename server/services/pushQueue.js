const logger = require("../utils/logger");

class PushQueue {
  constructor() {
    this.queue = [];
  }

  push(task) {
    this.queue.push(task);
    logger.info(`[PushQueue] Buffered push notification task. Queue length: ${this.queue.length}`);
  }

  async flush() {
    if (this.queue.length === 0) return;
    
    logger.info(`[PushQueue] Flushing ${this.queue.length} pending push tasks now that system is READY.`);
    
    // Copy and clear immediately to prevent race conditions
    const pending = [...this.queue];
    this.queue = [];

    for (const task of pending) {
      try {
        await task();
      } catch (err) {
        logger.error(`[PushQueue] Failed to execute buffered push task: ${err.message}`);
      }
    }
  }
}

module.exports = new PushQueue();
