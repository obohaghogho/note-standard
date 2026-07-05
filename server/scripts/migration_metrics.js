const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("=== V2 MIGRATION TRACKING METRICS ===");

  // 1. Legacy Web Subscriptions
  let { count: legacyWebCount } = await supabase.from('push_subscriptions').select('*', { count: 'exact', head: true });
  // Legacy Native Tokens
  let { count: legacyNativeCount } = await supabase.from('native_device_tokens').select('*', { count: 'exact', head: true });
  
  // 2. V2 Installations
  let { count: v2InstallsCount } = await supabase.from('device_installations').select('*', { count: 'exact', head: true });

  // 3. V2 Unique Users
  // In Javascript client we can't easily do COUNT(DISTINCT user_id). We'll fetch user_ids and distinct them in memory.
  let { data: v2Users } = await supabase.from('installation_accounts').select('user_id');
  const uniqueUsers = new Set(v2Users?.map(u => u.user_id)).size;

  // 4. Telemetry (V2 vs Fallback)
  let { data: telemetry } = await supabase.from('push_delivery_telemetry').select('routing_engine_version, fallback_used');
  let v2LiveCount = 0;
  let fallbackCount = 0;
  
  if (telemetry) {
    telemetry.forEach(t => {
      // Only count actual live decisions where V2 was supposedly acting
      if (t.routing_engine_version === 'v2-live') {
        v2LiveCount++;
        if (t.fallback_used === true) fallbackCount++;
      }
    });
  }

  const v2PureCount = v2LiveCount - fallbackCount;
  const v2Percent = v2LiveCount > 0 ? ((v2PureCount / v2LiveCount) * 100).toFixed(2) : 0;
  const fallbackPercent = v2LiveCount > 0 ? ((fallbackCount / v2LiveCount) * 100).toFixed(2) : 0;

  console.log(`\nLegacy Pipeline:`);
  console.log(`- Legacy Web Subscriptions: ${legacyWebCount}`);
  console.log(`- Legacy Native Tokens: ${legacyNativeCount}`);
  console.log(`- TOTAL Legacy Endpoints: ${(legacyWebCount || 0) + (legacyNativeCount || 0)}`);

  console.log(`\nV2 Pipeline:`);
  console.log(`- V2 Device Installations: ${v2InstallsCount}`);
  console.log(`- Users with V2 Accounts: ${uniqueUsers}`);

  console.log(`\nDelivery Telemetry (v2-live only):`);
  console.log(`- Total live routing decisions: ${v2LiveCount}`);
  console.log(`- Pure V2 decisions: ${v2PureCount} (${v2Percent}%)`);
  console.log(`- Legacy Fallback used: ${fallbackCount} (${fallbackPercent}%)`);
}

run().catch(console.error);
