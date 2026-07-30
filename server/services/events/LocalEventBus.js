'use strict';

const IEventBus = require('./IEventBus');
const EventEmitter = require('events');
const logger = require('../../utils/logger');

class LocalEventBus extends IEventBus {
  constructor() {
    super();
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  async publish(eventName, payload) {
    logger.info(`[LocalEventBus] Event Published: ${eventName}`, { payload });
    setImmediate(() => {
      this.emitter.emit(eventName, payload);
    });
  }

  subscribe(eventName, handler) {
    this.emitter.on(eventName, async (data) => {
      try {
        await handler(data);
      } catch (err) {
        logger.error(`[LocalEventBus] Error handling event ${eventName}: ${err.message}`);
      }
    });
    logger.info(`[LocalEventBus] Subscribed handler to ${eventName}`);
  }
}

module.exports = new LocalEventBus();
