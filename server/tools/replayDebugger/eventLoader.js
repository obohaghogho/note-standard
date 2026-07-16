const db = require("../../config/database"); // Using the supabase singleton for consistency

async function loadEvents({ conversationId, correlationId }) {
    let query = `
        SELECT *
        FROM message_events
        WHERE 1=1
    `;

    const params = [];

    if (conversationId) {
        params.push(conversationId);
        query += ` AND conversation_id = $${params.length}`;
    }

    if (correlationId) {
        params.push(correlationId);
        query += ` AND correlation_id = $${params.length}`;
    }

    query += ` ORDER BY created_at ASC`;

    // Note: We use the supabase client. To execute raw SQL, we must use RPC or just fetch via the ORM.
    // Since message_events has RLS, we should fetch it via the ORM or an admin RPC.
    // The user's blueprint uses `db.query()`, assuming a raw Postgres client (pg).
    // Let's adapt it to use the Supabase JS client since the rest of the backend uses it.
    let supaQuery = db.from('message_events').select('*');
    if (conversationId) supaQuery = supaQuery.eq('conversation_id', conversationId);
    if (correlationId) supaQuery = supaQuery.eq('correlation_id', correlationId);
    supaQuery = supaQuery.order('created_at', { ascending: true });

    const { data, error } = await supaQuery;
    if (error) {
        console.error("[ReplayDebugger] Failed to load events:", error);
        throw error;
    }
    return data || [];
}

module.exports = { loadEvents };
