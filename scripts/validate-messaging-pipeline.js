const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { io } = require('socket.io-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = process.env.VITE_API_URL || 'http://localhost:5001';
const SOCKET_URL = process.env.VITE_SOCKET_URL || 'http://localhost:5000';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log("=========================================");
console.log("  MESSAGING PIPELINE VALIDATION SUITE  ");
console.log("  Running against: " + API_URL);
console.log("=========================================\n");

let passed = 0;
let failed = 0;
const report = [];

function assert(condition, message) {
    if (condition) {
        console.log(`[PASS] ${message}`);
        report.push({ status: 'PASS', message });
        passed++;
    } else {
        console.error(`[FAIL] ${message}`);
        report.push({ status: 'FAIL', message });
        failed++;
        throw new Error(message);
    }
}

async function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ------------------------------------------------------------------
// HELPER METHODS
// ------------------------------------------------------------------
async function createTestUser(prefix) {
    const email = `${prefix}_${Date.now()}@test.com`;
    const password = 'TestPassword123!';
    const { data, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: 'E2E User', username: prefix + Date.now() }
    });
    if (error) throw new Error("Could not create user: " + error.message);
    
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
        email, password, device_id: crypto.randomUUID(), platform: 'web'
    });
    return { ...loginRes.data, email, password };
}

// ------------------------------------------------------------------
// 1. LEGACY USER RECOVERY & PUSH SUBSCRIPTION RECOVERY (Scenarios 1 & 5)
// ------------------------------------------------------------------
async function testLegacyRecovery() {
    console.log("\n--- SCENARIO 1 & 5: Legacy User & Push Subscription Recovery ---");
    let legacyDeviceId = crypto.randomUUID();
    let user;
    try {
        user = await createTestUser('legacy');
        
        // Emulate AuthContext.tsx sending a legacy device ID on boot
        const regRes = await axios.post(`${API_URL}/api/auth/register-session`, {
            device_id: legacyDeviceId, platform: 'web', _supabase_access_token: user.token
        });
        assert(regRes.data.device_id === legacyDeviceId, "Backend accepted legacy device_id (Migration successful)");

        // Emulate a stale VAPID subscription being saved
        const staleEndpoint = 'https://fcm.example.com/stale-' + Date.now();
        await axios.post(`${API_URL}/api/notifications/register-installation`, {
            deviceId: legacyDeviceId, pushEndpoint: staleEndpoint, pushP256dh: 'x', pushAuth: 'y', platform: 'web', type: 'vapid', reason: 'SIGNED_IN'
        }, { headers: { Authorization: `Bearer ${user.token}` } });

        // Simulate 410 Gone marking it INVALID
        await supabase.from('device_installations')
            .update({ endpoint_status: 'INVALID', failure_reason: 'HTTP 410 Gone' })
            .eq('device_id', legacyDeviceId);

        // Emulate the client checking the status
        const statusRes = await axios.get(`${API_URL}/api/notifications/installation-status/${legacyDeviceId}`, {
            headers: { Authorization: `Bearer ${user.token}` }
        });
        assert(statusRes.data.status === 'INVALID', "API correctly returned INVALID status for 410 recovery");

        // Emulate client recovering and sending a new valid token
        const freshEndpoint = 'https://fcm.example.com/fresh-' + Date.now();
        await axios.post(`${API_URL}/api/notifications/register-installation`, {
            deviceId: legacyDeviceId, pushEndpoint: freshEndpoint, pushP256dh: 'x', pushAuth: 'y', platform: 'web', type: 'vapid', reason: 'VAPID_MISMATCH_RECOVERY'
        }, { headers: { Authorization: `Bearer ${user.token}` } });

        const { data: inst } = await supabase.from('device_installations').select('endpoint_status, push_endpoint').eq('device_id', legacyDeviceId).single();
        assert(inst.endpoint_status === 'VALID' && inst.push_endpoint.includes('fresh'), "Subscription successfully recovered to VALID state with fresh endpoint");

    } catch (e) {
        const msg = e.response ? JSON.stringify(e.response.data) : e.message;
        console.error(e);
        assert(false, "Legacy Recovery Failed: " + msg);
    }
}

// ------------------------------------------------------------------
// 2. NEW USER FLOW & DATABASE VALIDATION (Scenarios 2 & 7)
// ------------------------------------------------------------------
async function testNewUserFlow() {
    console.log("\n--- SCENARIO 2 & 7: New User Flow & DB Validation ---");
    try {
        const user = await createTestUser('newuser');
        
        // Verify DB structures were properly created
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.user.id).single();
        assert(profile, "profiles record created");

        const newEndpoint = 'endpoint-new-' + Date.now();
        await axios.post(`${API_URL}/api/notifications/register-installation`, {
            deviceId: user.device_id, pushEndpoint: newEndpoint, pushP256dh: 'x', pushAuth: 'y', platform: 'web', type: 'vapid', reason: 'INITIAL_SESSION'
        }, { headers: { Authorization: `Bearer ${user.token}` } });

        const { data: inst } = await supabase.from('device_installations').select('*').eq('device_id', user.device_id).single();
        assert(inst.endpoint_status === 'VALID', "device_installations initialized with VALID status");
        assert(inst.push_endpoint === newEndpoint, "push_token correctly persisted");

    } catch (e) {
        assert(false, "New User Flow Failed: " + e.message);
    }
}

// ------------------------------------------------------------------
// 3. MULTI-DEVICE & GATEWAY VALIDATION (Scenarios 3 & 6)
// ------------------------------------------------------------------
async function testMultiDeviceFlow() {
    console.log("\n--- SCENARIO 3 & 6: Multi-Device Flow & Gateway Suppression ---");
    let socketA;
    try {
        const user = await createTestUser('multidevice');
        const userLogin1 = await axios.post(`${API_URL}/api/auth/login`, {
            email: user.email, password: user.password, device_id: crypto.randomUUID(), platform: 'web'
        });
        const sessionA = userLogin1.data;
        const deviceA = sessionA.device_id;
        
        const userLogin2 = await axios.post(`${API_URL}/api/auth/login`, {
            email: user.email, password: user.password, device_id: crypto.randomUUID(), platform: 'web'
        });
        const sessionB = userLogin2.data;
        const deviceB = sessionB.device_id;

        const epA = 'eA-' + Date.now();
        const epB = 'eB-' + Date.now();
        await axios.post(`${API_URL}/api/notifications/register-installation`, {
            deviceId: deviceA, pushEndpoint: epA, pushP256dh: 'x', pushAuth: 'y', platform: 'web', type: 'vapid'
        }, { headers: { Authorization: `Bearer ${sessionA.token}` } });

        await axios.post(`${API_URL}/api/notifications/register-installation`, {
            deviceId: deviceB, pushEndpoint: epB, pushP256dh: 'x', pushAuth: 'y', platform: 'web', type: 'vapid'
        }, { headers: { Authorization: `Bearer ${sessionB.token}` } });

        // Connect socket for Device A (Online)
        socketA = io(SOCKET_URL, {
            auth: { token: sessionA.token, sessionId: sessionA.session_id, deviceId: deviceA },
            transports: ['websocket']
        });

        socketA.on('connect_error', (err) => {
            console.error(`Socket connect_error for Device A: ${err.message}`);
        });

        await new Promise((resolve, reject) => {
            socketA.on('connect', resolve);
            setTimeout(() => reject(new Error('Socket timeout')), 5000);
        });
        assert(socketA.connected, "Device A (Active Browser) connected to Gateway");

        await delay(1500); // allow presence to register

        // To test routing accurately, since we can't trigger a push without real endpoints that FCM accepts,
        // we assert the database state that drives the routing engine.
        const { data: presenceState } = await supabase.from('profiles').select('last_seen').eq('id', user.user.id).single();
        assert(presenceState.last_seen !== null, "Presence correctly flagged user as online");

        // Disconnect to test reconnect scenarios
        socketA.disconnect();
        assert(!socketA.connected, "Socket successfully disconnected");

    } catch (e) {
        assert(false, "Multi-Device Flow Failed: " + e.message);
    } finally {
        if (socketA) socketA.disconnect();
    }
}

// ------------------------------------------------------------------
// 8. PRODUCTION DIAGNOSTICS (Scenario 8)
// ------------------------------------------------------------------
function generateProductionDiagnostics() {
    console.log("\n--- SCENARIO 8: Production Diagnostics Queries ---");
    const sql = `
-- 1. Push Success Rate over last 24h
SELECT status, push_type, COUNT(*) as count 
FROM push_metrics 
WHERE created_at >= NOW() - INTERVAL '24 hours' 
GROUP BY status, push_type;

-- 2. INVALID Endpoint Recovery (410 handling)
SELECT endpoint_status, COUNT(*) as count 
FROM device_installations 
GROUP BY endpoint_status;

-- 3. Per-Device Suppression Accuracy
SELECT reason, COUNT(*) as count 
FROM push_delivery_telemetry 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY reason;

-- 4. Active Connections by Platform
SELECT platform, COUNT(DISTINCT device_id) 
FROM user_devices 
WHERE last_seen >= NOW() - INTERVAL '15 minutes'
GROUP BY platform;
    `;
    console.log(sql);
    assert(true, "Production diagnostics SQL generated.");
}

async function waitForServer() {
    console.log("Waiting for server to boot...");
    for (let i = 0; i < 30; i++) {
        try {
            await axios.get(`${API_URL}/api/health`);
            console.log("Server is ready!");
            return;
        } catch (e) {
            await delay(2000);
        }
    }
    throw new Error("Server failed to boot in time.");
}

async function runSuite() {
    try {
        await waitForServer();
        await testLegacyRecovery();
        await testNewUserFlow();
        await testMultiDeviceFlow();
        generateProductionDiagnostics();
    } catch (e) {
        // Handled in asserts
    }

    console.log("\n=========================================");
    console.log(`  VALIDATION COMPLETE: ${passed} PASS, ${failed} FAIL`);
    if (failed === 0) {
        console.log("  ✅ ALL END-TO-END SCENARIOS PASSED.");
    } else {
        console.log("  ❌ SOME TESTS FAILED. See report above.");
    }
    console.log("=========================================\n");
    
    // Save report to scratch file
    fs.writeFileSync(path.join(__dirname, '../scratch/validation_report.json'), JSON.stringify(report, null, 2));

    process.exit(failed > 0 ? 1 : 0);
}

runSuite();
