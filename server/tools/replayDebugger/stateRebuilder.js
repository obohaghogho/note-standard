function createInitialState() {
    return {
        messages: {},
        leases: {},
        deviceIndex: {},
        timeline: []
    };
}

function applyEvent(state, event) {
    const { event_type } = event;

    state.timeline.push(event);

    switch (event_type) {

        case "SENT": {
            const id = event.message_id;

            if (!state.messages[id]) {
                state.messages[id] = {
                    message_id: id,
                    status: "sent",
                    sent_at: event.created_at,
                    correlation_id: event.correlation_id
                };
            }
            break;
        }

        case "DELIVERED": {
            const msg = state.messages[event.message_id];
            if (msg) {
                msg.delivered = true;
                msg.delivered_at = event.created_at;
            }
            break;
        }

        case "READ": {
            const msg = state.messages[event.message_id];
            if (msg) {
                msg.read = true;
                msg.read_at = event.created_at;
            }
            break;
        }

        case "LEASE_TAKEN": {
            state.leases[event.conversation_id] = {
                device_id: event.device_id,
                at: event.created_at
            };
            break;
        }
    }

    return state;
}

function rebuildState(events) {
    let state = createInitialState();

    for (const event of events) {
        state = applyEvent(state, event);
    }

    return state;
}

module.exports = {
    rebuildState,
    applyEvent,
    createInitialState
};
