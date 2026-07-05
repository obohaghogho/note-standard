const leaseFix = require("./recoveryStrategies/leaseViolationFix");
const eventFix = require("./recoveryStrategies/missingEventRepair");
const queueFix = require("./recoveryStrategies/queueReconciliation");
const duplicateFix = require("./recoveryStrategies/duplicateEventCollapse");

function resolveStrategy(type) {
  const map = {
    LEASE_DRIFT: leaseFix,
    EVENT_DESYNC: eventFix,
    OFFLINE_QUEUE_CORRUPTION: queueFix,
    IDEMPOTENCY_BREAK: duplicateFix
  };

  return map[type];
}

module.exports = { resolveStrategy };
