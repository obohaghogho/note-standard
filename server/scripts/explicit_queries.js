const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("--- 1. COUNT FROM device_installations ---");
  let { count: c1 } = await supabase.from('device_installations').select('*', { count: 'exact', head: true });
  console.log("Count:", c1);

  console.log("\n--- 2. COUNT FROM installation_accounts ---");
  let { count: c2 } = await supabase.from('installation_accounts').select('*', { count: 'exact', head: true });
  console.log("Count:", c2);

  console.log("\n--- 3. LATEST 10 INSTALLATIONS ---");
  let { data: installs } = await supabase.from('device_installations').select('*').order('created_at', { ascending: false }).limit(10);
  console.log(JSON.stringify(installs, null, 2));

  if (installs && installs.length > 0) {
    const latestId = installs[0].installation_id;
    console.log(`\n--- 4. ACCOUNTS FOR INSTALLATION ${latestId} ---`);
    let { data: accs } = await supabase.from('installation_accounts').select('installation_id, user_id, session_state').eq('installation_id', latestId);
    console.log(JSON.stringify(accs, null, 2));
  }

  console.log("\n--- 5. TELEMETRY AGGREGATION ---");
  // Doing it manually since group by isn't direct in JS supabase client without RPC
  let { data: telemetry } = await supabase.from('push_delivery_telemetry').select('routing_decision');
  const grouped = {};
  if (telemetry) {
    telemetry.forEach(t => {
      grouped[t.routing_decision] = (grouped[t.routing_decision] || 0) + 1;
    });
  }
  console.log("Routing Decisions:");
  console.table(grouped);
}

run().catch(console.error);
