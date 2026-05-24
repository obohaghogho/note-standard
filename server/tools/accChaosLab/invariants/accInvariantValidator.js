function validateInvariants(events) {
  const violations = [];

  let leaseOwners = new Map();

  for (const e of events) {
    if (e.type === "LEASE_EVENT") {
      const lease = e.result?.leaseId;
      const device = e.deviceId;

      if (leaseOwners.has(lease) && leaseOwners.get(lease) !== device) {
        violations.push({
          type: "MULTI_WRITER_VIOLATION",
          lease,
          device
        });
      }

      leaseOwners.set(lease, device);
    }

    if (e.result?.status === "ALLOW_INVALID" || e.result?.decision === "ALLOW_INVALID") {
      violations.push({
        type: "INVALID_ALLOW"
      });
    }
  }

  return { violations };
}

module.exports = { validateInvariants };
