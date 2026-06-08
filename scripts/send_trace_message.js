/**
 * send_trace_message.js
 *
 * Sends a real chat:message via pg_notify directly to the production gateway,
 * targeting obohoboh107@gmail.com's user room.
 *
 * This tests the exact same path as the real API:
 *   realtime.emitToUsers(userIds, "chat:message", payload)
 *   → pg_notify("realtime_events", JSON.stringify({ type:"to_users", users:[uid], event:"chat:message", payload }))
 *   → Gateway dispatches to socket room user:<uid>
 *   → Browser receives and [CLIENT_TRACE] fires
 *
 * BEFORE RUNNING:
 *   1. Log in to localhost:5173 as obohoboh107@gmail.com
 *   2. Open a chat conversation (any)
 *   3. Open DevTools Console (F12)
 *   4. Run this script from the terminal
 *   5. Watch the console for [CLIENT_TRACE] lines
 */
require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const crypto = require('crypto');

// Use separate admin client to avoid auth context contamination
const adminSupabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
    // 1. Look up obohoboh107@gmail.com
    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('id, email, username')
        .eq('email', 'obohoboh107@gmail.com')
        .single();

    if (!profile) {
        console.error('Profile not found for obohoboh107@gmail.com');
        process.exit(1);
    }
    console.log(`User B (receiver): ${profile.id} (${profile.email})`);

    // 2. Find one of their real conversations to use as context
    const { data: membership } = await adminSupabase
        .from('conversation_members')
        .select('conversation_id, conversations(id, type)')
        .eq('user_id', profile.id)
        .limit(1)
        .single();

    const convId = membership?.conversation_id;
    if (!convId) {
        console.error('No conversations found for this user.');
        process.exit(1);
    }
    console.log(`Using conversation: ${convId}`);

    // 3. Build a realistic chat:message payload
    const fakeMessageId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const payload = {
        id: fakeMessageId,
        conversation_id: convId,
        sender_id: 'ffffffff-0000-0000-0000-000000000001', // Fake sender so isOwnMessage = false
        content: `[CLIENT_TRACE_TEST] Sent at ${new Date().toISOString()}`,
        type: 'text',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        event_id: eventId,
        sequence_number: Math.floor(Math.random() * 1000000),
        status: 'sent'
    };

    // 4. Build the exact envelope the gateway expects for to_users dispatch
    const envelope = {
        type: 'to_users',
        users: [profile.id],        // → gateway emits to user:<profile.id>
        event: 'chat:message',
        payload
    };

    // 5. Send via pg_notify to the production gateway
    let DATABASE_URL = process.env.DATABASE_URL;
    // Must use session mode port 5432 (not 6543 transaction pooler)
    if (DATABASE_URL.includes(':6543')) {
        DATABASE_URL = DATABASE_URL.replace(':6543', ':5432');
        console.log('Auto-switched to port 5432 for NOTIFY');
    }

    const pgClient = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    await pgClient.connect();
    console.log('Connected to PostgreSQL');

    const payloadStr = JSON.stringify(envelope);
    if (payloadStr.length > 7999) {
        console.error(`Payload too large (${payloadStr.length} bytes). PostgreSQL NOTIFY limit is 8000 bytes.`);
        await pgClient.end();
        process.exit(1);
    }

    await pgClient.query('SELECT pg_notify($1, $2)', ['realtime_events', payloadStr]);
    console.log(`\n✅ pg_notify sent!`);
    console.log(`   event_id:    ${eventId}`);
    console.log(`   message_id:  ${fakeMessageId}`);
    console.log(`   target user: ${profile.id}`);
    console.log(`   conv:        ${convId}`);
    console.log(`\n👀 NOW check the browser console for [CLIENT_TRACE] lines.`);
    console.log(`   The gateway should route this to socket room: user:${profile.id}`);

    await pgClient.end();
}

run().catch(console.error);
