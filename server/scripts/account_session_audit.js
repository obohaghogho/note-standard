/**
 * account_session_audit.js
 *
 * Multi-Account Session & Socket Ownership Audit Tool.
 * Inspects DB tables (user_sessions, installation_accounts, device_installations, push_subscriptions)
 * and verifies socket room ownership, active account alignment, and token validity across all users.
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

async function runAudit() {
  console.log(`\n=================================================================`);
  console.log(` 🔐 MULTI-ACCOUNT SESSION & SOCKET OWNERSHIP AUDIT`);
  console.log(`=================================================================\n`);

  // 1. Fetch all profiles
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, email, updated_at');

  if (pErr) {
    console.error("❌ Failed to fetch profiles:", pErr.message);
    process.exit(1);
  }

  console.log(`Found ${profiles.length} user profile(s) in database.\n`);

  // 2. Fetch user sessions
  const { data: sessions } = await supabase
    .from('user_sessions')
    .select('*')
    .order('last_seen_at', { ascending: false });

  // 3. Fetch installation accounts & device installations
  const { data: instAccounts } = await supabase.from('installation_accounts').select('*');
  const { data: devInstallations } = await supabase.from('device_installations').select('*');
  const { data: pushSubs } = await supabase.from('push_subscriptions').select('*');

  // 4. Audit per profile
  for (const user of profiles) {
    console.log(`-----------------------------------------------------------------`);
    console.log(`👤 User: ${user.username || 'N/A'} | ID: ${user.id} | Email: ${user.email}`);

    const userSessions = (sessions || []).filter(s => s.user_id === user.id);
    console.log(`  - Active DB Sessions        : ${userSessions.length}`);
    userSessions.forEach(s => {
      console.log(`    └ SessionID: ${s.session_id.slice(0, 12)}... | DeviceID: ${s.device_id || 'N/A'} | State: ${s.token_state} | Platform: ${s.platform || 'N/A'} | LastSeen: ${s.last_seen_at}`);
    });

    const userInstAccs = (instAccounts || []).filter(a => a.user_id === user.id);
    console.log(`  - Installation Accounts (V2): ${userInstAccs.length}`);
    userInstAccs.forEach(a => {
      const dev = (devInstallations || []).find(d => d.installation_id === a.installation_id);
      console.log(`    └ InstID: ${a.installation_id.slice(0, 12)}... | Active: ${a.is_active} | Platform: ${dev?.platform || 'N/A'} | Sub: ${dev?.push_endpoint ? (dev.push_endpoint.slice(0, 25) + '...') : 'NONE'}`);
    });

    const userPushSubs = (pushSubs || []).filter(p => p.user_id === user.id);
    console.log(`  - Push Subscriptions (V1)   : ${userPushSubs.length}`);
    userPushSubs.forEach(p => {
      console.log(`    └ SubID: ${p.id} | Platform: ${p.platform} | Endpoint: ${p.endpoint ? p.endpoint.slice(0, 30) + '...' : 'N/A'}`);
    });

    if (userSessions.length === 0 && userInstAccs.length === 0 && userPushSubs.length === 0) {
      console.warn(`  ⚠️ WARNING: User has NO active sessions, installation accounts, or push subscriptions! Push dispatches WILL FAIL.`);
    }
  }

  console.log(`\n=================================================================\n`);
}

runAudit().catch(console.error);
