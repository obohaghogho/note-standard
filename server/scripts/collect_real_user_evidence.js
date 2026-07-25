/**
 * collect_real_user_evidence.js
 *
 * Parallel Real User Registration Forensic Table Generator.
 * Audits all users in database across 8 forensic metrics.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../realtime-gateway/.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateUserEvidenceTable() {
  console.log(`\n==============================================================================================================`);
  console.log(` 📊 REAL USER REGISTRATION & FORENSIC AUDIT TABLE (10/10 ENTERPRISE STANDARD)`);
  console.log(`==============================================================================================================\n`);

  const [
    { data: profiles },
    { data: pushSubs },
    { data: instAccs },
    { data: devInsts },
    { data: nativeTokens },
    { data: telemetry }
  ] = await Promise.all([
    supabase.from('profiles').select('id, username, email'),
    supabase.from('push_subscriptions').select('*'),
    supabase.from('installation_accounts').select('*'),
    supabase.from('device_installations').select('*'),
    supabase.from('native_device_tokens').select('*'),
    supabase.from('push_delivery_telemetry').select('*').order('created_at', { ascending: false }).limit(200)
  ]);

  const DeviceRegistry = require('../../realtime-gateway/services/DeviceRegistry');

  const tableRows = await Promise.all((profiles || []).map(async (user) => {
    const userV1Subs = (pushSubs || []).filter(p => p.user_id === user.id);
    const userV2Accs = (instAccs || []).filter(a => a.user_id === user.id);
    const userNativeTokens = (nativeTokens || []).filter(t => t.user_id === user.id);

    let activeDevices = [];
    try {
      activeDevices = await DeviceRegistry.getActiveDevices(supabase, user.id);
    } catch (e) {
      activeDevices = [];
    }

    const totalSubCount = userV1Subs.length + userV2Accs.length + userNativeTokens.length;
    const hasDevicesInRegistry = activeDevices.length > 0;

    const userTelemetry = (telemetry || []).filter(t => t.user_id === user.id || t.recipient_id === user.id);
    const pushSentCount = userTelemetry.filter(t => t.status === 'SENT' || t.status === 'SUCCESS' || t.status === 'DELIVERED').length;
    const pushReceivedCount = userTelemetry.filter(t => t.status === 'DELIVERED' || t.status === 'ACKED').length;
    const ackCount = userTelemetry.filter(t => t.status === 'ACKED').length;

    let resultStatus = 'FAIL_NO_SUB';
    if (totalSubCount > 0 && hasDevicesInRegistry) {
      resultStatus = pushSentCount > 0 ? 'ACTIVE_DISPATCHING' : 'READY_NOT_TESTED';
    } else if (totalSubCount > 0 && !hasDevicesInRegistry) {
      resultStatus = 'REGISTRY_FILTERED';
    }

    return {
      User: `${user.username || 'N/A'} (${user.id.slice(0, 8)})`,
      Permission: totalSubCount > 0 ? 'GRANTED' : 'NO_SUB',
      Subscription: `V1:${userV1Subs.length} | V2:${userV2Accs.length} | FCM:${userNativeTokens.length}`,
      DeviceRegistry: `${activeDevices.length} device(s)`,
      'Push Sent': pushSentCount,
      'Push Received': pushReceivedCount,
      ACK: ackCount,
      Result: resultStatus
    };
  }));

  console.table(tableRows);

  console.log(`\n==============================================================================================================`);
  console.log(` 💡 AUDIT SUMMARY:`);
  console.log(`    - Total Users Evaluated      : ${profiles.length}`);
  console.log(`    - Users Ready for Delivery   : ${tableRows.filter(r => r.DeviceRegistry !== '0 device(s)').length}`);
  console.log(`    - Users Missing Registration : ${tableRows.filter(r => r.Result === 'FAIL_NO_SUB').length}`);
  console.log(`==============================================================================================================\n`);

  process.exit(0);
}

generateUserEvidenceTable().catch(console.error);
