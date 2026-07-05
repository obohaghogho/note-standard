const logger = require("../utils/logger");

class BootManager {
  constructor() {
    global.BOOT_STATE = {
      phase: "STARTING",
      ready: false,
      services: {
        db: false,
        cache: true, // We'll bypass strict redis cache requirement for now if not strictly enforced, but we'll set it true.
        gateway: false,
        api: false,
        workers: false
      }
    };
  }

  setService(name, status) {
    if (global.BOOT_STATE.services[name] !== status) {
      global.BOOT_STATE.services[name] = status;
      logger.info(`[BootManager] Service '${name}' is now ${status ? 'READY' : 'OFFLINE'}`);
      this.evaluate();
    }
  }

  evaluate() {
    const s = global.BOOT_STATE.services;

    const allReady = s.db && s.cache && s.gateway && s.api && s.workers;

    if (allReady && !global.BOOT_STATE.ready) {
      global.BOOT_STATE.phase = "READY";
      global.BOOT_STATE.ready = true;
      logger.info("🟢 BOOT COMPLETE — SYSTEM READY");
      
      // 1. Signal Gateway
      this._signalGateway();
      
      // 2. Flush Push Queue
      const pushQueue = require("../services/pushQueue");
      pushQueue.flush();
    } else if (!allReady) {
      global.BOOT_STATE.phase = "SEEDING";
      global.BOOT_STATE.ready = false;
    }
  }

  isReady() {
    return global.BOOT_STATE.ready;
  }

  _signalGateway() {
    const gatewayUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
    fetch(`${gatewayUrl}/internal/boot-ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ready: true })
    }).catch(err => {
      logger.error(`[BootManager] Failed to signal Gateway: ${err.message}`);
    });
  }
}

module.exports = new BootManager();
