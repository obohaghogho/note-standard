function classifyFailure(anomaly) {
  switch (anomaly.type) {
    case "LEASE_VIOLATION_READ":
    case "LEASE_VIOLATION":
      return "LEASE_DRIFT";

    case "DELIVERED_WITHOUT_SENT":
      return "EVENT_DESYNC";

    case "QUEUE_STALL":
      return "OFFLINE_QUEUE_CORRUPTION";

    case "DUPLICATE_EVENT":
      return "IDEMPOTENCY_BREAK";

    default:
      return "UNKNOWN";
  }
}

module.exports = { classifyFailure };
