function verifyIntegrity(events) {
  const violations = [];

  const leaseOwner = new Map();
  const messageState = new Map();

  for (const e of events) {
    if (e.type === "LEASE_EVENT") {
      const existing = leaseOwner.get(e.result?.leaseId);

      if (existing && existing !== e.deviceId) {
        violations.push({
          type: "MULTI_WRITER_DETECTED",
          leaseId: e.result?.leaseId
        });
      }

      leaseOwner.set(e.result?.leaseId, e.deviceId);
    }

    if (e.result?.status === "ALLOW_INVALID" || e.result?.decision === "ALLOW_INVALID") {
      violations.push({
        type: "INVALID_ALLOW_DETECTED"
      });
    }

    if (e.type === "DELIVERED") {
      if (!messageState.has(e.messageId)) {
        messageState.set(e.messageId, "DELIVERED_WITHOUT_SENT");
        violations.push({
          type: "ORPHAN_DELIVERY",
          messageId: e.messageId
        });
      }
    }

    if (e.type === "SENT") {
        messageState.set(e.messageId, "SENT");
    }
  }

  return { violations };
}

module.exports = { verifyIntegrity };
