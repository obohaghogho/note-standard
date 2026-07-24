/**
 * PaymentEventBus.js
 * ==================
 * Domain event bus for the payment lifecycle.
 * Decouples payment processing from downstream services.
 *
 * Events emitted:
 *   payment.initialized   → Ledger, Notifications
 *   payment.authorized    → Ledger
 *   payment.captured      → Ledger, Wallet
 *   payment.settled       → Ledger, Wallet, Notifications
 *   payment.failed        → Ledger, Notifications
 *   payment.refund_issued → Ledger, Wallet, Notifications
 *   wallet.credited       → Notifications
 *   ledger.updated        → Analytics
 *
 * NoteStandard Financial Platform v4
 */

const EventEmitter = require('events');
const logger = require('../../utils/logger');

class PaymentEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this._registerCoreHandlers();
  }

  /**
   * Emits a typed payment lifecycle event.
   * @param {string} eventName - e.g. 'payment.captured'
   * @param {Object} payload
   */
  emit(eventName, payload) {
    logger.debug(`[PaymentEventBus] Emitting: ${eventName}`, { reference: payload?.reference });
    return super.emit(eventName, {
      ...payload,
      _eventName: eventName,
      _emittedAt: new Date().toISOString(),
    });
  }

  /**
   * Registers a handler for a specific lifecycle event.
   * @param {string} eventName
   * @param {Function} handler  - async function(payload)
   */
  on(eventName, handler) {
    const safeHandler = async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error(`[PaymentEventBus] Handler error for "${eventName}": ${err.message}`);
      }
    };
    return super.on(eventName, safeHandler);
  }

  /**
   * Core system handlers always registered at startup.
   */
  _registerCoreHandlers() {
    // Log all lifecycle events for observability
    const ALL_EVENTS = [
      'payment.initialized',
      'payment.authorized',
      'payment.captured',
      'payment.settled',
      'payment.failed',
      'payment.refund_issued',
      'wallet.credited',
      'wallet.debited',
      'ledger.updated',
    ];

    ALL_EVENTS.forEach((event) => {
      super.on(event, (payload) => {
        logger.info(`[PaymentEvent] ${event} | ref=${payload?.reference || 'n/a'} | provider=${payload?.provider || 'n/a'}`);
      });
    });
  }
}

// Singleton — shared across the entire Node.js process
const bus = new PaymentEventBus();

module.exports = bus;
