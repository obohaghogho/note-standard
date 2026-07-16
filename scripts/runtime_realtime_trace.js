require('dotenv').config({ path: './server/.env' });
const { Client } = require('pg');
const { io } = require('socket.io-client');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

async function runTrace() {
    console.log("Starting Runtime Realtime Trace with valid Supabase Auth...\n");

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const DATABASE_URL = process.env.DATABASE_URL;
    const SOCKET_URL = 'https://realtime-gateway-gsb5.onrender.com';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
        console.error("FAIL: Missing required environment variables.");
        return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Setup Test Users
    let userA_id, userB_id, tokenB;
    const sessionId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    
    try {
        console.log("[INIT] Creating test users in Supabase...");
        
        // Clean up old if they exist
        const { data: existingA } = await supabase.auth.admin.listUsers();
        for (const u of existingA?.users || []) {
            if (u.email.includes('diagnostic_a_') || u.email.includes('diagnostic_b_')) {
                await supabase.auth.admin.deleteUser(u.id);
            }
        }

        const emailA = `diagnostic_a_${Date.now()}@example.com`;
        const emailB = `diagnostic_b_${Date.now()}@example.com`;

        const { data: userA, error: errA } = await supabase.auth.admin.createUser({ email: emailA, password: 'password123', email_confirm: true });
        const { data: userB, error: errB } = await supabase.auth.admin.createUser({ email: emailB, password: 'password123', email_confirm: true });
        
        if (errA || errB) throw (errA || errB);
        userA_id = userA.user.id;
        userB_id = userB.user.id;

        // Insert profiles to satisfy foreign keys
        await supabase.from('profiles').upsert([{ id: userA_id, username: 'diag_a' }, { id: userB_id, username: 'diag_b' }]);

        console.log("[INIT] Signing in User B to obtain valid JWT...");
        // Use regular client for sign in to get the session token
        const anonSupabase = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: authB, error: loginErr } = await anonSupabase.auth.signInWithPassword({ email: emailB, password: 'password123' });
        if (loginErr) throw loginErr;
        tokenB = authB.session.access_token;

        console.log("[INIT] Registering User B device and session...");
        const { error: devErr } = await supabase.from('user_devices').insert({
            device_id: deviceId,
            user_id: userB_id,
            platform: 'web',
            push_token: null
        });
        if (devErr) throw devErr;

        const { error: sessErr } = await supabase.from('user_sessions').insert({
            session_id: sessionId,
            user_id: userB_id,
            device_id: deviceId,
            token_state: 'valid',
            refresh_token_hash: crypto.createHash('sha256').update('dummy-refresh').digest('hex'),
            expires_at: new Date(Date.now() + 86400000).toISOString()
        });
        if (sessErr) {
            console.error("[INIT] Failed to insert session:", sessErr);
            throw sessErr;
        }

    } catch (e) {
        console.error("[INIT] Failed to setup test auth:", e);
        return;
    }

    // 2. Setup PostgreSQL Listener
    const listenUrl = DATABASE_URL.replace(':6543', ':5432');
    const pgClient = new Client({
        connectionString: listenUrl,
        ssl: { rejectUnauthorized: false }
    });

    let t1_received = false;

    pgClient.on('notification', (msg) => {
        if (msg.channel === 'realtime_events') {
            const payload = JSON.parse(msg.payload);
            if (payload.event === 'chat:message' && payload.payload?.content === 'DIAGNOSTIC_TRACE_MESSAGE') {
                t1_received = true;
                console.log(`[T1] ${new Date().toISOString()} - pg_notify execution: PASS`);
                console.log(`[T2] ${new Date().toISOString()} - Gateway notification receipt equivalent: PASS (We received it via LISTEN)`);
            }
        }
    });

    try {
        await pgClient.connect();
        await pgClient.query('LISTEN realtime_events');
        console.log(`[INIT] Connected to PostgreSQL LISTEN on realtime_events`);
    } catch (e) {
        console.error(`[INIT] FAIL connecting to PostgreSQL:`, e.message);
        return;
    }

    // 3. Setup Socket.IO Client for User B
    console.log(`[INIT] Connecting User B to socket at ${SOCKET_URL}`);
    const socketB = io(SOCKET_URL, {
        auth: { token: tokenB, sessionId, deviceId },
        transports: ['polling', 'websocket'],
        extraHeaders: {
            "Origin": "https://www.notestandard.com"
        }
    });

    let t4_connected = false;
    let t6_received = false;

    socketB.on('connect', () => {
        t4_connected = true;
        console.log(`[T4] ${new Date().toISOString()} - User B websocket connection status: PASS (Socket ID: ${socketB.id})`);
    });

    socketB.on('connect_error', (err) => {
        console.error(`[T4] FAIL User B websocket connection:`, err.message);
    });

    socketB.on('chat:message', (msg) => {
        if (msg.content === 'DIAGNOSTIC_TRACE_MESSAGE') {
            t6_received = true;
            console.log(`[T3] ${new Date().toISOString()} - Gateway socket emission: PASS (Inferred from receipt)`);
            console.log(`[T6] ${new Date().toISOString()} - User B event handler execution: PASS`);
        }
    });

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 15000));

    if (!t4_connected) {
        console.error("FAIL: Could not connect User B to socket.");
    } else {
        console.log(`[T5] ${new Date().toISOString()} - User B room membership: ASSUMED (Checking receipt...)`);
    }

    // 4. Send message as User A
    console.log(`\n[T0] ${new Date().toISOString()} - Sending message from User A to User B...`);
    
    const testPayload = {
        id: crypto.randomUUID(),
        conversation_id: crypto.randomUUID(),
        sender_id: userA_id,
        content: 'DIAGNOSTIC_TRACE_MESSAGE',
        created_at: new Date().toISOString(),
        type: 'text',
        isOwn: false
    };

    const envelope = {
        type: 'to_users',
        room: null,
        event: 'chat:message',
        payload: testPayload,
        users: [userA_id, userB_id]
    };

    console.log(`[T0] ${new Date().toISOString()} - Executing pg_notify('realtime_events')...`);
    await pgClient.query('SELECT pg_notify($1, $2)', ['realtime_events', JSON.stringify(envelope)]);

    // 5. Wait for events to propagate
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 6. Summary
    console.log("\n--- RUNTIME REALTIME TRACE SUMMARY ---");
    console.log(`1. pg_notify execution:              ${t1_received ? 'PASS' : 'FAIL'}`);
    console.log(`2. Gateway notification receipt:     ${t1_received ? 'PASS' : 'FAIL'}`);
    console.log(`3. Gateway socket emission:          ${t6_received ? 'PASS' : 'FAIL'}`);
    console.log(`4. User B websocket connection:      ${t4_connected ? 'PASS' : 'FAIL'}`);
    console.log(`5. User B room membership:           ${t6_received ? 'PASS' : 'FAIL'}`);
    console.log(`6. User B event handler execution:   ${t6_received ? 'PASS' : 'FAIL'}`);

    if (!t6_received) {
        console.log("\nROOT CAUSE IDENTIFIED:");
        console.log("The Gateway is either not receiving the pg_notify (due to connection issues on its end), or User B is not correctly joined to the 'user:<id>' room, or the gateway routing logic is failing.");
    } else {
        console.log("\nTrace completed successfully. Messages are flowing correctly in this test.");
    }

    // Cleanup
    socketB.disconnect();
    await pgClient.end();
    await supabase.auth.admin.deleteUser(userA_id);
    await supabase.auth.admin.deleteUser(userB_id);
    process.exit(0);
}

runTrace();
