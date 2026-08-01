'use strict';

/**
 * TreasuryFeatureFlags.js
 * =======================
 * Enterprise Feature Flag Controller for NoteStandard Treasury Platform.
 *
 * Allows individual treasury capabilities to be toggled dynamically at runtime
 * without requiring server restarts or code redeployments:
 *   - INSTANT_WITHDRAWALS
 *   - INTERNAL_FX_INVENTORY
 *   - AI_DRIVEN_REPLENISHMENT
 *   - AUTO_RESERVE_BALANCING
 *   - PROVIDER_AUTO_ROUTING
 *   - CROSS_BORDER_PAYOUTS
 *
 * @module services/treasury/TreasuryFeatureFlags
 */

const logger = require('../../utils/logger');

class TreasuryFeatureFlags {
  constructor() {
    this.flags = new Map([
      ['INSTANT_WITHDRAWALS', true],
      ['INTERNAL_FX_INVENTORY', true],
      ['AI_DRIVEN_REPLENISHMENT', true],
      ['AUTO_RESERVE_BALANCING', true],
      ['PROVIDER_AUTO_ROUTING', true],
      ['CROSS_BORDER_PAYOUTS', true],
    ]);
  }

  isEnabled(flagName) {
    const key = String(flagName).toUpperCase();
    return this.flags.get(key) ?? true;
  }

  setFlag(flagName, enabled) {
    const key = String(flagName).toUpperCase();
    this.flags.set(key, Boolean(enabled));
    logger.info(`[TreasuryFeatureFlags] Feature flag '${key}' set to ${Boolean(enabled)}`);
    return true;
  }

  getAllFlags() {
    const res = {};
    for (const [k, v] of this.flags.entries()) {
      res[k] = v;
    }
    return res;
  }
}

module.exports = new TreasuryFeatureFlags();
