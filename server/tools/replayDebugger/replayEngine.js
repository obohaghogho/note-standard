const { loadEvents } = require("./eventLoader");
const { rebuildState } = require("./stateRebuilder");
const { analyze } = require("./diffAnalyzer");

async function runReplay({ conversationId, correlationId }) {

    const events = await loadEvents({
        conversationId,
        correlationId
    });

    const finalState = rebuildState(events);
    const anomalies = analyze(events);

    return {
        conversation_id: conversationId,
        final_state: {
            messages: finalState.messages,
            leases: finalState.leases
        },
        timeline: finalState.timeline,
        anomalies
    };
}

module.exports = { runReplay };
