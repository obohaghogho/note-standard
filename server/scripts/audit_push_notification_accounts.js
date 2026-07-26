const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const serviceSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const targetAccounts = [
  'stephen',
  'mary',
  'obodoeshike',
  'admin@notestandard'
];

async function auditPushNotificationAccounts() {
  console.log("=========================================================");
  console.log("  FORENSIC PUSH NOTIFICATION AUDIT FOR TARGET ACCOUNTS   ");
  console.log("=========================================================\n");

  // 1. Fetch profiles for target accounts
  const { data: profiles, error: pErr } = await serviceSupabase
    .from('profiles')
    .select('id, username, email, full_name, role, plan_tier')
    .or(targetAccounts.map(term => `full_name.ilike.%${term}%,username.ilike.%${term}%,email.ilike.%${term}%`).join(','));

  if (pErr) {
    console.error("Error fetching profiles:", pErr);
    process.exit(1);
  }

  console.log(`Found ${profiles.length} profiles matching audit terms:\n`);

  for (const prof of profiles) {
    console.log(`---------------------------------------------------------`);
    console.log(`User Profile: [${prof.full_name || prof.username}]`);
    console.log(`ID:           ${prof.id}`);
    console.log(`Email:        ${prof.email}`);
    console.log(`Username:     ${prof.username}`);
    console.log(`Role / Tier:  ${prof.role} / ${prof.plan_tier}`);

    // 2. Query push_subscriptions table
    const { data: pushSubs, error: subErr } = await serviceSupabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', prof.id);

    if (subErr) {
      console.log(`[push_subscriptions] Query error: ${subErr.message}`);
    } else {
      console.log(`[push_subscriptions] Count: ${pushSubs?.length || 0}`);
      if (pushSubs && pushSubs.length > 0) {
        pushSubs.forEach((sub, idx) => {
          console.log(`  Sub #${idx + 1}: platform=${sub.platform}, endpoint=${sub.endpoint ? sub.endpoint.substring(0, 45) + '...' : 'N/A'}, fcm_token=${sub.fcm_token ? sub.fcm_token.substring(0, 25) + '...' : 'N/A'}, created_at=${sub.created_at}`);
        });
      } else {
        console.log(`  ❌ NO PUSH SUBSCRIPTION RECORD FOUND IN push_subscriptions TABLE!`);
      }
    }

    // 3. Query user_push_tokens table (if exists)
    const { data: tokenSubs, error: tokErr } = await serviceSupabase
      .from('user_push_tokens')
      .select('*')
      .eq('user_id', prof.id);

    if (!tokErr && tokenSubs && tokenSubs.length > 0) {
      console.log(`[user_push_tokens] Count: ${tokenSubs.length}`);
      tokenSubs.forEach((t, i) => {
        console.log(`  Token #${i + 1}: platform=${t.platform}, token=${t.push_token ? t.push_token.substring(0, 25) + '...' : 'N/A'}`);
      });
    } else if (tokErr) {
      console.log(`[user_push_tokens] Query note: ${tokErr.message}`);
    } else {
      console.log(`[user_push_tokens] Count: 0`);
    }

    // 4. Query notification_preferences table (if exists)
    const { data: prefs, error: prefErr } = await serviceSupabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', prof.id)
      .maybeSingle();

    if (!prefErr && prefs) {
      console.log(`[notification_preferences]:`, JSON.stringify(prefs));
    } else if (prefErr) {
      console.log(`[notification_preferences] Query note: ${prefErr.message}`);
    } else {
      console.log(`[notification_preferences]: Default (None explicitly configured in DB)`);
    }

    console.log(`---------------------------------------------------------\n`);
  }
}

auditPushNotificationAccounts().then(() => process.exit(0)).catch(err => {
  console.error("Audit failed:", err);
  process.exit(1);
});
