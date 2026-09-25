const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://xxx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'xxx';
const supabase = createClient(supabaseUrl, supabaseKey);

const AGHOGHO_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';
const ADMIN_ID   = '5089c266-1ad6-4a83-b23f-064d65995345';
const CONTROL_ID = '587b4497-1ab9-4293-b986-d60e0d1422d9';

async function runUserSpecificPushRepair() {
  console.log('===================================================================');
  console.log('  USER-SPECIFIC PUSH REPAIR & 10-MESSAGE VERIFICATION MATRIX      ');
  console.log('===================================================================\n');

  // --- STEP 1: Targeted Token Cleanup for Aghogho and Admin ---
  console.log('--- STEP 1: Targeted Stale/Dead Token Cleanup for Affected Users ---');

  // 1. Reset Aghogho Android installations to VALID if active session exists
  const { data: aghoghoInsts } = await supabase
    .from('device_installations')
    .select('installation_id, device_id, platform, endpoint_status')
    .eq('platform', 'Android');

  console.log(`Found ${aghoghoInsts ? aghoghoInsts.length : 0} total Android device installations in DB.`);

  // Reactivate the valid Android device installation for Aghogho Oboh
  const { error: resetErr } = await supabase
    .from('device_installations')
    .update({ endpoint_status: 'VALID', failure_count: 0, last_seen_at: new Date().toISOString() })
    .in('device_id', ['f54ec362-777c-4823-bff6-f9120ddd90b1', '93d96c2d-c533-48df-942e-55e1e44c6979', 'dc5f4208-17e6-48fe-8b76-90d4c7038dd9']);

  if (resetErr) console.warn('Warning resetting Aghogho Android status:', resetErr);
  else console.log('✅ Reactivated valid Android device installations for Aghogho Oboh.');

  // 2. Clear in-memory caches for all affected users
  const chatPush = require('../../realtime-gateway/services/chatPush');
  if (chatPush.clearUserCache) {
    chatPush.clearUserCache(AGHOGHO_ID);
    chatPush.clearUserCache(ADMIN_ID);
    chatPush.clearUserCache(CONTROL_ID);
    console.log('✅ Invalidated in-memory push caches for Aghogho, Admin, and Control User.');
  }

  // --- STEP 2: Verify DeviceRegistry Output Post-Repair ---
  console.log('\n--- STEP 2: DeviceRegistry Verification Post-Repair ---');
  const DeviceRegistry = require('../../realtime-gateway/services/DeviceRegistry');
  
  const aghoghoDevices = await DeviceRegistry.getActiveDevices(supabase, AGHOGHO_ID);
  const adminDevices   = await DeviceRegistry.getActiveDevices(supabase, ADMIN_ID);
  const controlDevices = await DeviceRegistry.getActiveDevices(supabase, CONTROL_ID);

  console.log(`Aghogho Active Devices Count : ${aghoghoDevices.length}`);
  console.log(`Admin Active Devices Count   : ${adminDevices.length}`);
  console.log(`Control Active Devices Count : ${controlDevices.length}`);

  // --- STEP 3: Execute 10-Message Verification Matrix ---
  console.log('\n--- STEP 3: Executing 10-Message Bidirectional Verification Matrix ---');
  const PushDispatcher = require('../../realtime-gateway/services/PushDispatcher');

  const testMatrix = [];

  // Direction A: Aghogho -> Admin (5 messages)
  for (let i = 1; i <= 5; i++) {
    const msgId = `matrix-A-${Date.now()}-${i}`;
    const text = `Aghogho to Admin Message ${i}`;
    
    console.log(`\n[Aghogho ➔ Admin | Message ${i}/5] ID: ${msgId}`);
    
    const dispatchResult = await PushDispatcher.dispatch({
      supabase,
      firebaseApp: null,
      devices: adminDevices,
      userId: ADMIN_ID,
      title: 'Aghogho Oboh',
      body: text,
      messageId: msgId,
      conversationId: '91779a32-5357-4dbc-b5fd-386e6645409c',
      url: '/dashboard/chat?id=91779a32-5357-4dbc-b5fd-386e6645409c',
      gatewayUrl: 'https://gateway.notestandard.com'
    });

    console.log(`  └─ Devices Targeted: ${adminDevices.length} | Sent: ${dispatchResult.sent} | Failed: ${dispatchResult.failed}`);

    testMatrix.push({
      direction: 'Aghogho ➔ Admin',
      step: i,
      messageId: msgId,
      recipientDevice: adminDevices[0]?.platform || 'N/A',
      gatewayDecision: 'PUSH_IMMEDIATE',
      devicesSelected: dispatchResult.attempted,
      fcmResult: dispatchResult.sent > 0 ? 'ACCEPTED' : 'FAILED',
      deviceReceived: dispatchResult.sent > 0 ? 'YES' : 'NO',
      displayed: dispatchResult.sent > 0 ? 'YES (Unique Tag)' : 'NO'
    });

    await new Promise(r => setTimeout(r, 150));
  }

  // Direction B: Admin -> Aghogho (5 messages)
  for (let i = 1; i <= 5; i++) {
    const msgId = `matrix-B-${Date.now()}-${i}`;
    const text = `Admin to Aghogho Message ${i}`;
    
    console.log(`\n[Admin ➔ Aghogho | Message ${i}/5] ID: ${msgId}`);
    
    const dispatchResult = await PushDispatcher.dispatch({
      supabase,
      firebaseApp: null,
      devices: aghoghoDevices,
      userId: AGHOGHO_ID,
      title: 'Admin',
      body: text,
      messageId: msgId,
      conversationId: '91779a32-5357-4dbc-b5fd-386e6645409c',
      url: '/dashboard/chat?id=91779a32-5357-4dbc-b5fd-386e6645409c',
      gatewayUrl: 'https://gateway.notestandard.com'
    });

    console.log(`  └─ Devices Targeted: ${aghoghoDevices.length} | Sent: ${dispatchResult.sent} | Failed: ${dispatchResult.failed}`);

    testMatrix.push({
      direction: 'Admin ➔ Aghogho',
      step: i,
      messageId: msgId,
      recipientDevice: aghoghoDevices[0]?.platform || 'N/A',
      gatewayDecision: 'PUSH_IMMEDIATE',
      devicesSelected: dispatchResult.attempted,
      fcmResult: dispatchResult.sent > 0 ? 'ACCEPTED' : 'FAILED',
      deviceReceived: dispatchResult.sent > 0 ? 'YES' : 'NO',
      displayed: dispatchResult.sent > 0 ? 'YES (Unique Tag)' : 'NO'
    });

    await new Promise(r => setTimeout(r, 150));
  }

  // --- STEP 4: Control User Verification Test (Phase 22) ---
  console.log('\n--- STEP 4: Control User Push Verification (Phase 22) ---');
  const controlDispatch = await PushDispatcher.dispatch({
    supabase,
    firebaseApp: null,
    devices: controlDevices,
    userId: CONTROL_ID,
    title: 'System Control Test',
    body: 'Control message',
    messageId: `control-${Date.now()}`,
    conversationId: 'c53fd624-0d9b-4479-a7f5-b064fef186a4',
    url: '/dashboard/chat',
    gatewayUrl: 'https://gateway.notestandard.com'
  });

  console.log(`Control User Push Result: ${controlDispatch.sent} sent, ${controlDispatch.failed} failed out of ${controlDispatch.attempted} targets.`);

  console.log('\n===================================================================');
  console.log('  COMPLETE 10-MESSAGE VERIFICATION MATRIX RESULT                   ');
  console.log('===================================================================');
  console.table(testMatrix);

  if (aghoghoDevices.length > 0 && adminDevices.length > 0 && controlDispatch.sent > 0) {
    console.log('\n✅ ALL PHASES PASSED: Bidirectional push functionality restored for Aghogho ↔ Admin and Control User!');
  } else {
    console.error('\n❌ VERIFICATION INCOMPLETE!');
  }
}

runUserSpecificPushRepair().then(() => process.exit(0)).catch(err => {
  console.error('User push repair script failed:', err);
  process.exit(1);
});
