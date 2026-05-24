function analyze(events) {
    const anomalies = [];

    const sentMessages = new Set();
    const deliveredMessages = new Map(); // message_id -> device_id
    const leaseMap = new Map();

    for (const event of events) {

        switch (event.event_type) {

            case "SENT":
                sentMessages.add(event.message_id);
                break;

            case "DELIVERED":
                if (!sentMessages.has(event.message_id)) {
                    anomalies.push({
                        type: "DELIVERED_WITHOUT_SENT",
                        message_id: event.message_id,
                        device_id: event.device_id
                    });
                }
                deliveredMessages.set(event.message_id, event.device_id);
                break;

            case "READ":
                const leaseOwner = leaseMap.get(event.conversation_id);

                if (leaseOwner && leaseOwner !== event.device_id) {
                    anomalies.push({
                        type: "LEASE_VIOLATION_READ",
                        message_id: event.message_id,
                        device_id: event.device_id
                    });
                }
                break;

            case "LEASE_TAKEN":
                leaseMap.set(event.conversation_id, event.device_id);
                break;
        }
    }

    return anomalies;
}

module.exports = { analyze };
