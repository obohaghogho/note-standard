const crypto = require("crypto");

function buildState(events) {
  const state = {
    messages: {},
    leases: {},
    counters: {
      sent: 0,
      delivered: 0,
      read: 0
    }
  };

  for (const e of events) {
    switch (e.type) {
      case "SENT":
        state.counters.sent++;
        state.messages[e.messageId] = "SENT";
        break;

      case "DELIVERED":
        state.counters.delivered++;
        state.messages[e.messageId] = "DELIVERED";
        break;

      case "READ":
        state.counters.read++;
        state.messages[e.messageId] = "READ";
        break;

      case "LEASE_EVENT":
        if (e.result?.leaseId && e.deviceId) {
           state.leases[e.result.leaseId] = e.deviceId;
        }
        break;
    }
  }

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(state))
    .digest("hex");

  return { state, hash };
}

module.exports = { buildState };
