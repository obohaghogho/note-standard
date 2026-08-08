/**
 * NgnDepositReconciliationWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Backward-compatible alias wrapper for DepositReconciliationWorker.js.
 * All deposit reconciliation is processed by the universal multi-currency engine.
 */

const DepositReconciliationWorker = require("./DepositReconciliationWorker");

module.exports = DepositReconciliationWorker;
