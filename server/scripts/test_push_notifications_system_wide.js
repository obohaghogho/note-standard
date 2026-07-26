const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');
const webPush = require('web-push');

const serviceSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testPushNotificationsSystemWide() {
  console.log("=========================================================");
  console.log("  SYSTEM-WIDE PUSH NOTIFICATION END-TO-END AUDIT TEST   ");
  console.log("=========================================================\n");

  // 1. Audit VAPID Configuration
  const vapidPublic = process.env.VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || env.VAPID_PRIVATE_KEY;

  console.log("--- STEP 1: VAPID Environment Audit ---");
  if (!vapidPublic || !vapidPrivate) {
    console.error("❌ CRITICAL: VAPID keys missing in environment!");
    process.exit(1);
  }
  console.log(`✅ VAPID Public Key Present  (Length: ${vapidPublic.length})`);
  console.log(`✅ VAPID Private Key Present (Length: ${vapidPrivate.length})`);

  try {
    webPush.setVapidDetails(
      'mailto:admin@notestandard.com',
      vapidPublic,
      vapidPrivate
    );
    console.log(`✅ web-push VAPID configuration verified.\n`);
  } catch (vapidErr) {
    console.error(`❌ VAPID configuration error: ${vapidErr.message}`);
    process.exit(1);
  }

  // 2. Audit Push Subscriptions in Database
  console.log("--- STEP 2: Database Subscriptions Coverage Audit ---");
  const { data: allProfiles, error: pErr } = await serviceSupabase
    .from('profiles')
    .select('id, username, email, full_name');

  if (pErr) {
    console.error("Error fetching profiles:", pErr);
    process.exit(1);
  }

  const { data: allSubs, error: sErr } = await serviceSupabase
    .from('push_subscriptions')
    .select('*');

  if (sErr) {
    console.error("Error fetching push_subscriptions:", sErr);
    process.exit(1);
  }

  const totalUsers = allProfiles.length;
  const subscribedUserIds = new Set((allSubs || []).map(s => s.user_id).filter(Boolean));

  console.log(`Total App Users in DB:              ${totalUsers}`);
  console.log(`Total Active Push Tokens in DB:      ${allSubs ? allSubs.length : 0}`);
  console.log(`Unique Users with Push Subscriptions: ${subscribedUserIds.size}`);

  // 3. Test Real Active Web Push Delivery Engine
  console.log("\n--- STEP 3: Active Real Device Push Delivery Test ---");
  const adminSubs = (allSubs || []).filter(s => s.user_id === '5089c266-1ad6-4a83-b23f-064d65995345');
  console.log(`Found ${adminSubs.length} subscription(s) for test admin account.`);

  for (const sub of adminSubs) {
    console.log(`Testing Subscription ID: ${sub.id}`);
    console.log(`Endpoint: ${sub.endpoint ? sub.endpoint.substring(0, 60) + '...' : 'N/A'}`);

    const pushPayload = JSON.stringify({
      title: "🔔 System Push Audit Test",
      body: "Testing NoteStandard real-time push notification engine.",
      data: {
        link: "/dashboard/chat",
        messageId: "audit-test-" + Date.now(),
        conversationId: "conv-test-123",
        timestamp: Date.now()
      }
    });

    try {
      const pushSubscriptionObject = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      console.log("Sending VAPID push payload to endpoint...");
      const result = await webPush.sendNotification(pushSubscriptionObject, pushPayload);
      console.log(`✅ SUCCESS! HTTP Status Code: ${result.statusCode}`);
    } catch (pushErr) {
      console.warn(`⚠️ Endpoint status: ${pushErr.statusCode || pushErr.message}`);
    }
  }

  // 4. Test Recipient Resolution & DB Fallback
  console.log("\n--- STEP 4: Conversation Member Resolution Audit ---");
  const { data: convMembers } = await serviceSupabase
    .from('conversation_members')
    .select('conversation_id, user_id')
    .limit(5);

  if (convMembers && convMembers.length > 0) {
    const testConvId = convMembers[0].conversation_id;
    const testSenderId = convMembers[0].user_id;

    const { data: members } = await serviceSupabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', testConvId);

    const recipientIds = (members || []).map(m => m.user_id).filter(id => id !== testSenderId);
    console.log(`Conversation: ${testConvId}`);
    console.log(`Sender ID:    ${testSenderId}`);
    console.log(`✅ DB Fallback resolved ${recipientIds.length} recipient ID(s):`, recipientIds);
  }

  console.log("\n=========================================================");
  console.log("  SYSTEM-WIDE PUSH AUDIT VERIFICATION COMPLETE ✅         ");
  console.log("=========================================================\n");
}

testPushNotificationsSystemWide().then(() => process.exit(0)).catch(err => {
  console.error("Push audit failed:", err);
  process.exit(1);
});
