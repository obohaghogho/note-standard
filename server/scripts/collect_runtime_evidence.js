/**
 * collect_runtime_evidence.js — Fast Forensic Evidence Collector
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../realtime-gateway/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Import DeviceRegistry from realtime-gateway
const DeviceRegistry = require('../../realtime-gateway/services/DeviceRegistry');

async function runAudit() {
  const timestamp = new Date().toISOString();
  console.log(`\n=================================================================`);
  console.log(` 🔬 BANK-GRADE FORENSIC AUDIT REPORT — ${timestamp}`);
  console.log(`=================================================================\n`);

  // 1. Environment & VAPID Key Fingerprint Verification
  console.log(`--- 1. ENVIRONMENT & VAPID CREDENTIAL AUDIT ---`);
  const pubKey = process.env.VAPID_PUBLIC_KEY || '';
  const privKey = process.env.VAPID_PRIVATE_KEY || '';

  const pubFp = pubKey ? crypto.createHash('sha256').update(pubKey).digest('hex').slice(0, 16) : 'MISSING';
  const privFp = privKey ? crypto.createHash('sha256').update(privKey).digest('hex').slice(0, 16) : 'MISSING';

  console.log(`Server VAPID Public Key Fingerprint : ${pubFp}`);
  console.log(`Server VAPID Private Key Fingerprint: ${privFp}`);
  console.log(`USE_V2_PUSH_ROUTING                  : ${process.env.USE_V2_PUSH_ROUTING || 'NOT_SET'}`);
  console.log(`PUSH_ENABLED                         : ${process.env.PUSH_ENABLED || 'NOT_SET'}`);

  // 2. Query Database Tables
  console.log(`\n--- 2. DATABASE INTEGRITY AUDIT ---`);
  const { data: v1Subs } = await supabase.from('push_subscriptions').select('id, user_id, endpoint, platform, status, last_seen_at');
  console.log(`Total V1 push_subscriptions rows: ${v1Subs?.length || 0}`);

  const { data: v2Inst } = await supabase.from('device_installations').select('installation_id, device_id, platform, type, push_endpoint, endpoint_status');
  console.log(`Total V2 device_installations rows: ${v2Inst?.length || 0}`);

  const { data: v2Acc } = await supabase.from('installation_accounts').select('installation_id, user_id, session_state');
  console.log(`Total V2 installation_accounts rows: ${v2Acc?.length || 0}`);

  // Test raw Supabase V2 query that DeviceRegistry uses
  const testUserId = v2Acc?.[0]?.user_id;
  if (testUserId) {
    console.log(`\nTesting DeviceRegistry Supabase query for user: ${testUserId}`);
    const { data: v2Data, error: v2Error } = await supabase
      .from('installation_accounts')
      .select('session_state, device_installations(installation_id, type, push_endpoint, platform, push_p256dh, push_auth, device_id, endpoint_status, last_seen_at)')
      .eq('user_id', testUserId);

    if (v2Error) {
      console.error(`❌ CRITICAL: DeviceRegistry V2 query failed:`, v2Error);
    } else {
      console.log(`✅ DeviceRegistry V2 query succeeded! Returned ${v2Data?.length || 0} rows.`);
    }

    try {
      const devices = await DeviceRegistry.getActiveDevices(supabase, testUserId);
      console.log(`✅ DeviceRegistry.getActiveDevices returned ${devices.length} devices:`);
      console.log(JSON.stringify(devices, null, 2));
    } catch (err) {
      console.error(`❌ DeviceRegistry.getActiveDevices threw exception:`, err);
    }
  }

  console.log(`\n=================================================================`);
  console.log(` 🏁 END OF FORENSIC AUDIT REPORT`);
  console.log(`=================================================================\n`);
}

runAudit().catch(err => {
  console.error('🔥 Uncaught error in audit script:', err);
  process.exit(1);
});
