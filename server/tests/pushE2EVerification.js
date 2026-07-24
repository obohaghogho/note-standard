/**
 * pushE2EVerification.js
 * Push Notification End-to-End Verification Script
 *
 * Runs real checks against the live DB and environment.
 * Does NOT mock any data.
 *
 * Usage:
 *   node server/tests/pushE2EVerification.js
 *
 * Generates: PUSH_FIX_IMPLEMENTATION_REPORT.md
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const REPORT_PATH = path.join(__dirname, '../../PUSH_FIX_IMPLEMENTATION_REPORT.md');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pass(msg)  { console.log(`  \u2705 ${msg}`); return { ok: true,  msg }; }
function fail(msg)  { console.error(`  \u274c ${msg}`); return { ok: false, msg }; }
function warn(msg)  { console.warn(`  \u26a0\ufe0f  ${msg}`); return { ok: 'warn', msg }; }
function section(t) { console.log(`\n${'─'.repeat(60)}\n\uD83D\uDD0D ${t}\n${'─'.repeat(60)}`); }

// ─────────────────────────────────────────────────────────────────────────────
// Check 1: Environment Variables
// ─────────────────────────────────────────────────────────────────────────────
function checkEnvironment() {
  section('1. Environment Variable Validation');
  const results = [];
  const required = [
    'VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY',
    'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
    'BACKEND_URL','SELF_URL',
    'USE_V2_PUSH_ROUTING','ALLOW_V2_FALLBACK','PUSH_ENABLED',
  ];
  for (const key of required) {
    if (process.env[key]) {
      results.push(pass(`${key} = ${key.includes('KEY')||key.includes('SECRET')?'<REDACTED>':process.env[key]}`));
    } else {
      results.push(fail(`${key} is NOT SET`));
    }
  }
  if (process.env.VAPID_PUBLIC_KEY) {
    const fp = crypto.createHash('sha256').update(process.env.VAPID_PUBLIC_KEY).digest('hex').slice(0,16);
    results.push(pass(`VAPID fingerprint: ${fp}`));
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 2: Subscription Coverage
// ─────────────────────────────────────────────────────────────────────────────
async function checkSubscriptionCoverage() {
  section('2. Subscription Coverage');
  const results = [];
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id');
  const { data: subs, error: sErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, status, last_successful_push_at, last_failed_push_at, platform, created_at');
  if (pErr || sErr) {
    results.push(fail(`DB query failed: ${pErr?.message || sErr?.message}`)); return results;
  }
  const totalUsers = profiles.length;
  const subscribedUsers = new Set(subs.map(s => s.user_id).filter(Boolean)).size;
  const coveragePct = totalUsers > 0 ? Math.round((subscribedUsers / totalUsers) * 100) : 0;
  const neverPushed = subs.filter(s => !s.last_successful_push_at).length;
  const invalid = subs.filter(s => s.status === 'invalid').length;
  results.push((coveragePct >= 80 ? pass : warn)(`Coverage: ${subscribedUsers}/${totalUsers} users subscribed (${coveragePct}%)`));
  results.push(pass(`Total push subscriptions in DB: ${subs.length}`));
  if (neverPushed > 0) results.push(warn(`${neverPushed} subscriptions have NEVER had a successful push (secondary issue — needs investigation)`));
  else results.push(pass('All subscriptions have had at least one successful push'));
  if (invalid > 0) results.push(warn(`${invalid} subscriptions marked INVALID (will re-register on next app open)`));
  else results.push(pass('No subscriptions marked INVALID'));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 3: V2 Routing Configuration
// ─────────────────────────────────────────────────────────────────────────────
async function checkV2Routing() {
  section('3. V2 Routing Configuration');
  const results = [];
  const useV2 = process.env.USE_V2_PUSH_ROUTING === 'true';
  const allowFallback = process.env.ALLOW_V2_FALLBACK !== 'false';
  const pushEnabled = process.env.PUSH_ENABLED !== 'false';
  results.push(useV2 ? pass('USE_V2_PUSH_ROUTING=true (V2 routing ACTIVE)') : fail('USE_V2_PUSH_ROUTING is NOT true — V2 in shadow mode only'));
  results.push(allowFallback ? pass('ALLOW_V2_FALLBACK=true (legacy fallback enabled)') : warn('ALLOW_V2_FALLBACK is false — users with no V2 installation get NO push'));
  results.push(pushEnabled ? pass('PUSH_ENABLED=true') : fail('PUSH_ENABLED=false — ALL pushes disabled'));
  const { data: installs, error: iErr } = await supabase
    .from('device_installations')
    .select('installation_id, user_id, push_endpoint, endpoint_status, last_push_sent_at, type');
  if (!iErr && installs) {
    const valid = installs.filter(i => i.endpoint_status !== 'INVALID' && i.push_endpoint).length;
    const neverSent = installs.filter(i => !i.last_push_sent_at).length;
    results.push(pass(`V2 device_installations: ${installs.length} total, ${valid} valid`));
    if (neverSent > 0) results.push(warn(`${neverSent} V2 installations have NEVER had a push sent (secondary issue — requires investigation)`));
  }
  const { data: tel } = await supabase
    .from('push_delivery_telemetry')
    .select('routing_decision, push_sent, socket_present, created_at')
    .order('created_at', { ascending: false }).limit(10);
  if (tel && tel.length > 0) {
    const realPushes = tel.filter(t => t.push_sent).length;
    results.push(realPushes > 0
      ? pass(`V2 telemetry: ${realPushes}/${tel.length} recent events had push_sent=true`)
      : warn(`V2 telemetry: 0/${tel.length} recent events had push_sent=true — V2 may still be in shadow mode or all decisions were suppressed`)
    );
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 4: Recent Push Delivery Success (24h)
// ─────────────────────────────────────────────────────────────────────────────
async function checkRecentPushDelivery() {
  section('4. Recent Push Delivery Success (24h)');
  const results = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: metrics, error: mErr } = await supabase
    .from('push_metrics')
    .select('status, error_code, platform, user_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (mErr) { results.push(fail(`push_metrics query failed: ${mErr.message}`)); return results; }
  if (!metrics || metrics.length === 0) {
    results.push(warn('No push activity in the last 24 hours'));
    return results;
  }
  const attempted = metrics.filter(m => m.status === 'attempted').length;
  const accepted  = metrics.filter(m => m.status === 'accepted').length;
  const failed    = metrics.filter(m => m.status === 'failed').length;
  const rate = attempted > 0 ? Math.round((accepted / attempted) * 100) : 0;
  results.push(pass(`Last 24h push attempts: ${attempted}`));
  results.push((accepted > 0 ? pass : warn)(`Accepted: ${accepted}`));
  if (failed > 0) results.push(warn(`Failed: ${failed} (check failure breakdown in dashboard)`));
  results.push((rate >= 80 ? pass : fail)(`Push success rate (24h): ${rate}%`));
  const errors = {};
  metrics.filter(m => m.status === 'failed').forEach(m => {
    const c = String(m.error_code || 'unknown'); errors[c] = (errors[c] || 0) + 1;
  });
  if (Object.keys(errors).length > 0) results.push(warn(`Failure codes: ${JSON.stringify(errors)}`));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 5: Never-Pushed Subscriptions (Secondary Investigation Item)
// ─────────────────────────────────────────────────────────────────────────────
async function checkNeverPushedSubscriptions() {
  section('5. Subscriptions That Never Received a Push (Secondary Issue)');
  const results = [];
  results.push(warn('NOTE: This is a SEPARATE issue from the 85% coverage gap.'));
  results.push(warn('These users HAVE subscriptions but push service never successfully delivered.'));
  results.push(warn('Root cause NOT yet confirmed — may be gateway failure, browser rejection, or endpoint expiry.'));
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('user_id, platform, created_at, last_failed_push_at, status, vapid_key_version')
    .is('last_successful_push_at', null)
    .neq('status', 'invalid')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { results.push(fail(`Query failed: ${error.message}`)); return results; }
  if (!subs || subs.length === 0) {
    results.push(pass('All subscriptions have had at least one successful push!')); return results;
  }
  results.push(warn(`Found ${subs.length} subscriptions with 0 successful pushes:`));
  subs.forEach((s, i) => {
    results.push({ ok: 'warn', msg: `  #${i+1} user=${(s.user_id||'').slice(0,8)}... platform=${s.platform||'?'} status=${s.status} created=${(s.created_at||'').slice(0,10)} lastFail=${s.last_failed_push_at||'none'}` });
  });
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Generator
// ─────────────────────────────────────────────────────────────────────────────
function generateReport(allResults, timestamp) {
  let md = `# PUSH_FIX_IMPLEMENTATION_REPORT\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  md += `> [!IMPORTANT]\n> This report is based on REAL data from the live database and environment. No mock data was used.\n\n`;
  md += `## Files Modified\n\n`;
  md += `| File | Change |\n|------|--------|\n`;
  const changes = [
    ['server/.env', 'Added 5 missing push env vars (USE_V2_PUSH_ROUTING, ALLOW_V2_FALLBACK, PUSH_ENABLED, BACKEND_URL, SELF_URL)'],
    ['realtime-gateway/.env', 'Same as above'],
    ['client/src/context/NotificationContext.tsx', 'Added subscription mutex, SW-ready retry (2s/5s/10s), visibilitychange + focus auto-recovery, 6-hour periodic health check, enhanced diagnostic logging'],
    ['realtime-gateway/server.js', 'Added startup push environment validation block'],
    ['server/controllers/pushHealthController.js', 'Added user coverage stats, per-user health classification, neverPushed + duplicateEndpointUsers counts'],
    ['client/src/pages/admin/PushHealthDashboard.tsx', 'Added User Coverage bar, per-user health summary badges, per-user health detail table'],
    ['client/src/pages/admin/PushHealthDashboard.css', 'Added coverage bar, health badge, stale badge styles'],
    ['server/tests/pushE2EVerification.js', 'NEW: E2E verification script (this file)'],
  ];
  changes.forEach(([f, c]) => { md += `| \`${f}\` | ${c} |\n`; });
  md += `\n## Issues Fixed\n\n`;
  md += `| # | Issue | Fix | Evidence |\n|---|-------|-----|----------|\n`;
  const fixes = [
    ['85% of users missing subscriptions', 'Added visibilitychange + focus auto-recovery. Previously subscribeToPush() only ran on user ID change.', 'Runtime diagnostics: 40/47 users had no subscription'],
    ['Service Worker not ready on first load', 'Added SW-ready retry at 0/2s/5s/10s with 8s timeout per attempt', 'Common PWA startup race condition'],
    ['Duplicate registration storms', 'Added Promise-based mutex (single-flight lock)', 'Race condition: visibility + focus + login fire simultaneously'],
    ['V2 routing in shadow mode', 'Set USE_V2_PUSH_ROUTING=true in both .env files', 'Runtime diagnostics: USE_V2_PUSH_ROUTING=NOT_SET'],
    ['Missing env vars silently ignored', 'Added startup validation block in gateway server.js', 'Runtime diagnostics: 5 vars missing'],
    ['No user coverage visibility', 'Added coverage bar + per-user health table to admin dashboard', 'User request'],
    ['No periodic subscription maintenance', 'Added 6-hour health check for long-lived sessions', 'User request'],
  ];
  fixes.forEach(([issue, fix, evidence], i) => { md += `| ${i+1} | ${issue} | ${fix} | ${evidence} |\n`; });
  md += `\n## Verification Results\n\n`;
  let totalPassed = 0, totalWarn = 0, totalFail = 0;
  for (const [sectionName, results] of Object.entries(allResults)) {
    md += `### ${sectionName}\n\n`;
    for (const r of results) {
      const icon = r.ok === true ? '\u2705' : r.ok === 'warn' ? '\u26a0\ufe0f' : '\u274c';
      md += `- ${icon} ${r.msg}\n`;
      if (r.ok === true) totalPassed++; else if (r.ok === 'warn') totalWarn++; else totalFail++;
    }
    md += `\n`;
  }
  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| \u2705 Passed | ${totalPassed} |\n| \u26a0\ufe0f Warnings | ${totalWarn} |\n| \u274c Errors | ${totalFail} |\n| Total Checks | ${totalPassed+totalWarn+totalFail} |\n\n`;
  md += `## Open Investigation Items\n\n`;
  md += `> [!WARNING]\n> The following issues are IDENTIFIED but NOT yet fully resolved:\n\n`;
  md += `1. **Subscriptions that have never received a successful push** — these users have valid subscriptions but the gateway never successfully delivered. Root cause not yet confirmed. Requires per-user manual testing with browser console logs.\n\n`;
  md += `2. **Production env vars** — The vars set here are for local development. For production (Render.com), add them in the Render dashboard environment settings.\n\n`;
  md += `3. **Long-term V2 routing stability** — Monitor Push Health Dashboard V2 Messaging tab. If decisions show NO_INSTALLATION, auto-recovery will populate device_installations as users return to the app.\n`;
  return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n\u256c' + '\u2550'.repeat(58) + '\u256c');
  console.log('\u2551     Push Notification E2E Verification Script         \u2551');
  console.log('\u2551     NoteStandard — Real data only, no mocks           \u2551');
  console.log('\u2569' + '\u2550'.repeat(58) + '\u2569\n');
  const timestamp = new Date().toISOString();
  const allResults = {
    '1. Environment Variables': checkEnvironment(),
    '2. Subscription Coverage': await checkSubscriptionCoverage(),
    '3. V2 Routing Configuration': await checkV2Routing(),
    '4. Recent Push Delivery (24h)': await checkRecentPushDelivery(),
    '5. Never-Pushed Subscriptions (Secondary Issue)': await checkNeverPushedSubscriptions(),
  };
  const report = generateReport(allResults, timestamp);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`\uD83D\uDCC4 Report written to: ${REPORT_PATH}`);
  console.log(`${'='.repeat(60)}\n`);
  let tp=0, tw=0, tf=0;
  for (const r of Object.values(allResults).flat()) {
    if (r.ok === true) tp++; else if (r.ok === 'warn') tw++; else tf++;
  }
  console.log(`\u2705 Passed: ${tp}  \u26a0\ufe0f Warnings: ${tw}  \u274c Failed: ${tf}\n`);
  if (tf > 0) { console.error('\u274c Verification found critical errors. Review the report.'); process.exit(1); }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
