const path = require('path');
const rootDir = 'd:/Users/Manuel/OneDrive/Desktop/note-standard-latest';
const { createClient } = require(path.join(rootDir, 'node_modules/@supabase/supabase-js'));
const env = require(path.join(rootDir, 'server/config/env'));

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function runRescueAudit() {
  console.log("=========================================================================");
  console.log("  SYSTEM-WIDE PUSH TOKEN RESCUE & AUDIT FOR ALL REGISTERED ACCOUNTS      ");
  console.log("=========================================================================\n");

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, email, full_name, created_at, is_online, last_seen')
    .order('created_at', { ascending: false });

  if (pErr) {
    console.error("Failed to fetch profiles:", pErr);
    process.exit(1);
  }

  console.log(`Auditing ${profiles.length} registered profiles...\n`);

  let totalStranded = 0;
  let totalHealthy = 0;

  for (const prof of profiles) {
    const { data: nativeTokens } = await supabase
      .from('native_device_tokens')
      .select('id')
      .eq('user_id', prof.id);

    const { data: webSubs } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', prof.id);

    const { data: instAccs } = await supabase
      .from('installation_accounts')
      .select('installation_id')
      .eq('user_id', prof.id);

    const nativeCount = nativeTokens ? nativeTokens.length : 0;
    const webCount = webSubs ? webSubs.length : 0;
    const instCount = instAccs ? instAccs.length : 0;

    const hasAnyToken = nativeCount > 0 || webCount > 0 || instCount > 0;

    if (!hasAnyToken) {
      totalStranded++;
      console.log(`⚠️ STRANDED ACCOUNT: [${prof.username}] (${prof.full_name || 'No name'}) | email:${prof.email} | id:${prof.id} | created:${prof.created_at}`);
    } else {
      totalHealthy++;
      console.log(`✅ HEALTHY ACCOUNT:  [${prof.username}] (${prof.full_name || 'No name'}) | Native:${nativeCount} | Web:${webCount} | V2:${instCount}`);
    }
  }

  console.log(`\n=========================================================================`);
  console.log(`SUMMARY: Total Profiles: ${profiles.length} | Healthy: ${totalHealthy} | Stranded (0 push tokens): ${totalStranded}`);
  console.log(`=========================================================================\n`);
}

runRescueAudit().then(() => process.exit(0)).catch(err => {
  console.error("Rescue audit failed:", err);
  process.exit(1);
});
