require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runFunnelAnalysis() {
  console.log("=== PUSH NOTIFICATION DROP-OFF FUNNEL ===");
  
  // 1. Total Users
  const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  console.log(`\nStage 0: Total Registered Users: ${totalUsers}`);
  
  // 2. Users with at least one notification job created
  const { data: notifiedUsers } = await supabase.from('notifications').select('receiver_id');
  const distinctNotified = new Set(notifiedUsers?.map(n => n.receiver_id));
  console.log(`Stage 1: Users with >=1 Notification Job Created: ${distinctNotified.size}`);
  
  // 3. Subscriptions Found
  const { data: webSubs } = await supabase.from('push_subscriptions').select('user_id');
  const distinctSubscribed = new Set(webSubs?.map(s => s.user_id));
  
  let subscribedAndNotified = 0;
  distinctNotified.forEach(id => {
    if (distinctSubscribed.has(id)) subscribedAndNotified++;
  });
  console.log(`Stage 2: Notified Users who actually have a Push Subscription: ${subscribedAndNotified}`);
  console.log(`   -> DROP-OFF: ${distinctNotified.size - subscribedAndNotified} users failed because no subscription was found in DB.`);
  
  console.log("\n=== LACK OF TELEMETRY FOR STAGES 3-7 ===");
  console.log("The application codebase currently lacks 'push_metrics' telemetry.");
  console.log("We cannot definitively answer:");
  console.log("  3. Was web-push send attempted? (No logs written during send)");
  console.log("  4. What response did the push provider return? (VAPID responses are not caught and stored)");
  console.log("  5. Did the service worker receive the push? (No SW POST-back endpoint exists)");
  console.log("  6. Was a notification displayed? (No Notification API event logging)");
}

runFunnelAnalysis().catch(console.error);
