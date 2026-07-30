'use strict';

/**
 * IEventBus
 * =========
 * Abstract interface for pluggable event bus infrastructure
 * (LocalEventBus, RedisStreamsEventBus, RabbitMQ).
 */

class IEventBus {
  async publish(eventName, payload) {
    throw new Error("NOT_IMPLEMENTED: publish()");
  }

  subscribe(eventName, handler) {
    throw new Error("NOT_IMPLEMENTED: subscribe()");
  }
}

module.exports = IEventBus;
