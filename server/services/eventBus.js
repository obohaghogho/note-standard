const EventEmitter = require('events');

class AppEventBus extends EventEmitter {}

const eventBus = new AppEventBus();

module.exports = eventBus;
