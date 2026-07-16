/**
 * create_and_send.js — Correct test: calls the real API endpoint so that
 * pg_notify fires and the gateway routes to user:<id> rooms properly.
 */
require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_API = 'http://localhost:5001/api';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const TARGET_EMAIL = 'test-b-1780902263795@example.com';
    const SENDER_EMAIL = 'obohoboh107@gmail.com';
    const SENDER_PASSWORD = 'Moneylove03@';

    // 1. Sign in as the sender to get a real JWT
    console.log(`Signing in as ${SENDER_EMAIL}...`);
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: SENDER_EMAIL,
        password: SENDER_PASSWORD
    });
    if (authErr) throw new Error('Sign in failed: ' + authErr.message);
    const senderToken = authData.session.access_token;
    const senderId = authData.user.id;
    console.log(`Sender signed in: ${senderId}`);

    // 2. Get target user_id
    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', TARGET_EMAIL)
        .single();

    if (!targetProfile) {
        console.error('Target user not found in profiles table');
        process.exit(1);
    }
    const recipientId = targetProfile.id;
    console.log(`Recipient: ${recipientId}`);

    // 3. Use the known shared conversation created earlier in this session
    // (obohoboh107 = 8677bd57, test-b = ead899d9)
    let convId = null;
    const { data: memberRows } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', recipientId);

    const recipientConvIds = memberRows?.map(r => r.conversation_id) || [];

    if (recipientConvIds.length > 0) {
        const { data: shared } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', senderId)
            .in('conversation_id', recipientConvIds);
        if (shared?.length > 0) {
            convId = shared[0].conversation_id;
            console.log(`Found shared conversation: ${convId}`);
        }
    }

    if (!convId) {
        // Create minimal conversation directly in DB
        console.log('No shared conversation. Creating one in DB...');
        const { data: newConv, error: convErr } = await supabase
            .from('conversations')
            .insert({ type: 'direct', name: '' })
            .select()
            .single();
        if (convErr || !newConv) throw new Error('Conv insert failed: ' + convErr?.message);
        convId = newConv.id;
        const { error: memErr } = await supabase.from('conversation_members').insert([
            { conversation_id: convId, user_id: recipientId, role: 'member', status: 'active' },
            { conversation_id: convId, user_id: senderId, role: 'member', status: 'active' }
        ]);
        if (memErr) throw new Error('Member insert failed: ' + memErr.message);
        console.log(`Created conversation in DB: ${convId}`);
    }

    // Register sender session so API accepts the request
    console.log('Registering sender session...');
    const sessionRes = await fetch(`${LOCAL_API}/session/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${senderToken}`
        },
        body: JSON.stringify({
            userId: senderId,
            deviceId: 'trace-device-' + Date.now(),
            userAgent: 'TraceScript/1.0'
        })
    });
    const sessionData = await sessionRes.json();
    console.log('Session:', sessionData?.session_id ? 'OK' : 'WARN: ' + JSON.stringify(sessionData));


    // 4. Send message via the real API (triggers pg_notify → gateway → socket)
    console.log(`\nSending message via API from ${SENDER_EMAIL} → ${TARGET_EMAIL}...`);
    const res = await fetch(`${LOCAL_API}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${senderToken}`
        },
        body: JSON.stringify({
            content: `[TRACE TEST] API-sent at ${new Date().toISOString()}`,
            type: 'text',
            eventId: crypto.randomUUID()
        })
    });

    const result = await res.json();
    if (!res.ok) throw new Error('Send failed: ' + JSON.stringify(result));

    console.log(`\n✅ Message sent via API: ${result.id}`);
    console.log(`   convId:    ${convId}`);
    console.log(`   sender:    ${senderId}`);
    console.log(`   recipient: ${recipientId}`);
    console.log(`\n👀 NOW watch User B's browser console for [CLIENT_TRACE] lines.`);
    console.log(`   The message went through the real API → pg_notify → gateway.`);
}

run().catch(console.error);
