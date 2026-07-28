/**
 * Realtime Withdrawal Event Gateway & WebSocket Sync
 * ──────────────────────────────────────────────────
 * Broadcasts real-time events to user and admin channels upon withdrawal state mutations.
 * Updates user wallet balances, transaction history, and admin dashboards without page refresh.
 */

const realtimeService = require("../services/realtimeService");
const logger          = require("../utils/logger");

const EVENTS = Object.freeze({
  WITHDRAWAL_CREATED:   "withdrawal_created",
  WITHDRAWAL_RESERVED:  "withdrawal_reserved",
  WITHDRAWAL_SETTLED:   "withdrawal_settled",
  WITHDRAWAL_FAILED:    "withdrawal_failed",
  WITHDRAWAL_REVERSED:  "withdrawal_reversed",
});

/**
 * Broadcast withdrawal lifecycle update to user and admin sockets.
 *
 * @param {string} userId 
 * @param {string} eventType 
 * @param {object} payload 
 */
async function emitWithdrawalEvent(userId, eventType, payload) {
  try {
    logger.info(`[RealtimeWithdrawal] Emitting '${eventType}' to user ${userId}`, payload);

    // Notify targeted user socket
    await realtimeService.notifyUser(userId, eventType, {
      ...payload,
      timestamp: new Date().toISOString(),
    });

    // Notify global system & admin channels for FinOps dashboard sync
    await realtimeService.broadcast("admin_withdrawal_update", {
      userId,
      eventType,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[RealtimeWithdrawal] Broadcast non-fatal warning: ${err.message}`);
  }
}

module.exports = { EVENTS, emitWithdrawalEvent };
