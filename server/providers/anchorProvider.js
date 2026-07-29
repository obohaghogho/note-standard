'use strict';
/**
 * server/providers/anchorProvider.js
 * ====================================
 * Top-level public facade for Anchor as a payment provider.
 * Delegates all operations to the full AnchorProvider implementation
 * in services/payment/providers/AnchorProvider.js.
 *
 * Usage:
 *   const anchor = require('./providers/anchorProvider');
 *   await anchor.initialize({ ... });
 *   await anchor.transfer({ ... });
 *   await anchor.balanceInquiry('NGN');
 *
 * @module providers/anchorProvider
 */

const AnchorProvider = require('../services/payment/providers/AnchorProvider');

// Export singleton instance
module.exports = new AnchorProvider();
