const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runValidation() {
  console.log("=== SHADOW MODE FORENSIC VALIDATION ===");

  // 1. Installation Health
  const { data: installations } = await supabase.from('device_installations').select('*');
  const { data: accounts } = await supabase.from('installation_accounts').select('*');
  const { data: telemetry } = await supabase.from('push_delivery_telemetry').select('*').order('created_at', { ascending: false });

  const totalInstallations = installations?.length || 0;
  const totalAccounts = accounts?.length || 0;

  // Devices linked to multiple accounts
  const installationAccountMap = {};
  accounts?.forEach(acc => {
    if (!installationAccountMap[acc.installation_id]) {
      installationAccountMap[acc.installation_id] = [];
    }
    installationAccountMap[acc.installation_id].push(acc.user_id);
  });
  const devicesMultipleAccounts = Object.keys(installationAccountMap).filter(id => installationAccountMap[id].length > 1).length;

  // Duplicate installations (same device_id)
  const deviceIdCounts = {};
  installations?.forEach(inst => {
    deviceIdCounts[inst.device_id] = (deviceIdCounts[inst.device_id] || 0) + 1;
  });
  const duplicates = Object.values(deviceIdCounts).filter(count => count > 1).length;

  // Orphaned installation_accounts
  const validInstallationIds = new Set(installations?.map(i => i.installation_id));
  const orphans = accounts?.filter(a => !validInstallationIds.has(a.installation_id)).length || 0;

  // Installations without endpoints
  const withoutEndpoints = installations?.filter(i => !i.push_endpoint).length || 0;

  console.log(`\n1. Installation Health:`);
  console.log(`- Total device_installations: ${totalInstallations}`);
  console.log(`- Total installation_accounts: ${totalAccounts}`);
  console.log(`- Devices linked to multiple accounts: ${devicesMultipleAccounts}`);
  console.log(`- Duplicate installations: ${duplicates}`);
  console.log(`- Orphaned installation_accounts: ${orphans}`);
  console.log(`- Installations without endpoints: ${withoutEndpoints}`);

  // 2. Routing Decisions
  console.log(`\n2. Routing Decisions (${telemetry?.length || 0} recorded events):`);
  if (telemetry && telemetry.length > 0) {
    telemetry.forEach(t => {
      console.log(`\nEvent [${t.message_id}] - Recipient: ${t.recipient_id}`);
      console.log(`  - resolved_installations: ${JSON.stringify(t.resolved_installations)}`);
      console.log(`  - installation_count: ${t.installation_count}`);
      console.log(`  - endpoint_count: ${t.endpoint_count}`);
      console.log(`  - active_socket_count: ${t.active_socket_count}`);
      console.log(`  - routing_decision: ${t.routing_decision}`);
      console.log(`  - suppression_reason: ${t.suppression_reason}`);
      console.log(`  - shadow_matches_legacy: ${t.shadow_matches_legacy}`);
    });
  } else {
    console.log("No telemetry events recorded yet.");
  }
}

runValidation().catch(console.error);
