/**
 * pushBatchTest.js
 * Fires a REAL test push to every user who has a subscription.
 * Records gateway HTTP status, subscription count, and platform per user.
 * No mocks. No simulation. Real delivery attempts only.
 *
 * Usage:  node server/tests/pushBatchTest.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const http  = require('http');
const https = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const GATEWAY_URL = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5001';

// ─── Gateway push helper ──────────────────────────────────────────────────────
function firePush(userId) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      userId,
      title: '🔔 NoteStandard Push Test',
      body:  'Batch connectivity test. If you see this, your push is working.',
      payload: {
        type:   'admin_batch_test',
        url:    '/dashboard/notifications',
        sentAt: new Date().toISOString(),
      },
    });

    let gatewayStatus = null;
    let gatewayBody   = '';
    const startMs = Date.now();

    try {
      const targetUrl = new URL('/internal/push', GATEWAY_URL);
      const lib = targetUrl.protocol === 'https:' ? https : http;

      const req = lib.request({
        hostname: targetUrl.hostname,
        port:     targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path:     targetUrl.pathname,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      }, (res) => {
        gatewayStatus = res.statusCode;
        res.on('data', (chunk) => { gatewayBody += chunk; });
        res.on('end', () => {
          resolve({
            userId,
            gatewayStatus,
            durationMs: Date.now() - startMs,
            body: (() => { try { return JSON.parse(gatewayBody); } catch { return gatewayBody; } })(),
            error: null,
          });
        });
      });

      req.on('error',   (err) => resolve({ userId, gatewayStatus: null, durationMs: Date.now() - startMs, body: null, error: err.message }));
      req.on('timeout', ()    => { req.destroy(); resolve({ userId, gatewayStatus: null, durationMs: Date.now() - startMs, body: null, error: 'TIMEOUT' }); });
      req.write(payload);
      req.end();
    } catch (err) {
      resolve({ userId, gatewayStatus: null, durationMs: Date.now() - startMs, body: null, error: err.message });
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Push Notification Batch Test — All Subscribed Users   ║');
  console.log('║   NoteStandard — Real pushes only. No mocks.            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // 1. Get every subscription
  const { data: subs, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, status, platform, device_id, last_successful_push_at, last_failed_push_at, created_at');

  if (subsErr) { console.error('❌ Could not fetch subscriptions:', subsErr.message); process.exit(1); }

  // 2. Get all profiles for coverage calculation
  const { data: profiles } = await supabase.from('profiles').select('id');
  const totalUsers = profiles?.length || 0;

  // Group by user
  const byUser = {};
  subs.forEach(s => {
    if (!s.user_id) return;
    if (!byUser[s.user_id]) byUser[s.user_id] = [];
    byUser[s.user_id].push(s);
  });

  const subscribedUserIds = Object.keys(byUser);
  const unsubscribedCount = totalUsers - subscribedUserIds.length;

  console.log(`📊 Database snapshot:`);
  console.log(`   Total users:          ${totalUsers}`);
  console.log(`   Users with sub:       ${subscribedUserIds.length} (${Math.round(subscribedUserIds.length/totalUsers*100)}%)`);
  console.log(`   Users WITHOUT sub:    ${unsubscribedCount} (${Math.round(unsubscribedCount/totalUsers*100)}%) — auto-recovery will register on next app open`);
  console.log(`   Total subscriptions:  ${subs.length}`);
  console.log(`   Gateway URL:          ${GATEWAY_URL}`);
  console.log(`\n🚀 Firing test push to ${subscribedUserIds.length} users...\n`);

  // 3. Fire pushes sequentially (to avoid hammering the gateway)
  const results = [];
  for (let i = 0; i < subscribedUserIds.length; i++) {
    const userId = subscribedUserIds[i];
    const userSubs = byUser[userId];
    const validSubs = userSubs.filter(s => s.status !== 'invalid');
    const platforms = [...new Set(userSubs.map(s => s.platform || 'unknown'))].join(', ');

    process.stdout.write(`  [${i+1}/${subscribedUserIds.length}] ${userId.slice(0,8)}... (${platforms}) → `);

    const result = await firePush(userId);

    const statusIcon =
      result.error ? '⚡ ERR' :
      result.gatewayStatus >= 200 && result.gatewayStatus < 300 ? '✅' :
      result.gatewayStatus === 410 ? '🗑 410' :
      result.gatewayStatus === 403 ? '🔑 403' :
      result.gatewayStatus === 404 ? '❓ 404' :
      `⚠ ${result.gatewayStatus}`;

    console.log(`${statusIcon}  (${result.durationMs}ms) ${result.error ? '— ' + result.error : ''}`);

    results.push({
      ...result,
      validSubs: validSubs.length,
      totalSubs: userSubs.length,
      platforms,
      neverPushed: !userSubs.some(s => s.last_successful_push_at),
      hasInvalid:  userSubs.some(s => s.status === 'invalid'),
    });

    // Brief pause between users to avoid rate-limiting
    if (i < subscribedUserIds.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 4. Log push_metric rows for all results
  const metricRows = results.map(r => ({
    platform:   'web',
    push_type:  'batch_test',
    status:     (r.gatewayStatus >= 200 && r.gatewayStatus < 300) ? 'attempted' : 'failed',
    error_code: (r.gatewayStatus >= 200 && r.gatewayStatus < 300) ? null : String(r.gatewayStatus || r.error || 'unknown'),
    user_id:    r.userId,
    device_id:  null,
  }));

  if (metricRows.length > 0) {
    const { error: mErr } = await supabase.from('push_metrics').insert(metricRows);
    if (mErr) console.warn(`\n⚠️  Could not write push_metrics: ${mErr.message}`);
    else console.log(`\n✅ Logged ${metricRows.length} push_metric rows — visible in admin dashboard activity feed.`);
  }

  // 5. Summary
  const accepted  = results.filter(r => r.gatewayStatus >= 200 && r.gatewayStatus < 300);
  const expired   = results.filter(r => r.gatewayStatus === 410);
  const forbidden = results.filter(r => r.gatewayStatus === 403);
  const notFound  = results.filter(r => r.gatewayStatus === 404);
  const errors    = results.filter(r => r.error);
  const other     = results.filter(r =>
    !r.error &&
    !(r.gatewayStatus >= 200 && r.gatewayStatus < 300) &&
    r.gatewayStatus !== 410 &&
    r.gatewayStatus !== 403 &&
    r.gatewayStatus !== 404
  );

  const acceptRate = subscribedUserIds.length > 0
    ? Math.round((accepted.length / subscribedUserIds.length) * 100)
    : 0;

  console.log('\n' + '═'.repeat(62));
  console.log('  BATCH TEST RESULTS');
  console.log('═'.repeat(62));
  console.log(`  Subscribed users tested:   ${subscribedUserIds.length}`);
  console.log(`  ✅ Gateway accepted:        ${accepted.length} (${acceptRate}%)`);
  console.log(`  🗑 HTTP 410 (expired):      ${expired.length}  → auto-cleaned, will re-register`);
  console.log(`  🔑 HTTP 403 (VAPID err):    ${forbidden.length}  → will re-register on next open`);
  console.log(`  ❓ HTTP 404 (not found):    ${notFound.length}`);
  console.log(`  ⚡ Network/timeout errors:  ${errors.length}`);
  console.log(`  ⚠  Other status:            ${other.length}`);
  console.log('═'.repeat(62));

  // Per-user detail table
  console.log('\n  USER DETAIL TABLE');
  console.log('  ' + '─'.repeat(90));
  console.log(`  ${'User ID'.padEnd(12)} ${'Status'.padEnd(14)} ${'Subs'.padEnd(6)} ${'Platforms'.padEnd(20)} ${'NeverPushed'.padEnd(13)} ${'ms'.padEnd(6)}`);
  console.log('  ' + '─'.repeat(90));

  results.forEach(r => {
    const statusStr =
      r.error          ? `ERR:${r.error.slice(0,8)}` :
      r.gatewayStatus >= 200 && r.gatewayStatus < 300 ? 'ACCEPTED' :
      `HTTP ${r.gatewayStatus}`;

    console.log(`  ${r.userId.slice(0,10).padEnd(12)} ${statusStr.padEnd(14)} ${String(r.validSubs+'/'+r.totalSubs).padEnd(6)} ${(r.platforms||'').slice(0,18).padEnd(20)} ${String(r.neverPushed).padEnd(13)} ${r.durationMs}`);
  });

  console.log('  ' + '─'.repeat(90));

  // Coverage verdict
  console.log('\n  COVERAGE VERDICT');
  console.log('  ' + '─'.repeat(62));

  if (acceptRate === 100 && unsubscribedCount === 0) {
    console.log('  🟢 100% — All users subscribed and gateway accepted all pushes.');
  } else {
    if (acceptRate < 100) {
      console.log(`  🟡 Gateway acceptance: ${acceptRate}% of SUBSCRIBED users`);
    }
    if (unsubscribedCount > 0) {
      console.log(`  🔴 ${unsubscribedCount} users have NO subscription yet.`);
      console.log(`     → Auto-recovery will register them when they next open the app.`);
      console.log(`     → Overall coverage will grow organically over the next several days.`);
    }
    if (expired.length > 0) {
      console.log(`  ℹ️  ${expired.length} HTTP 410 responses mean those endpoints expired.`);
      console.log(`     The gateway auto-deletes them. Auto-recovery re-registers on next open.`);
    }
    if (forbidden.length > 0) {
      console.log(`  ℹ️  ${forbidden.length} HTTP 403 responses indicate a VAPID mismatch.`);
      console.log(`     Auto-recovery will unsubscribe and re-register on next app open.`);
    }
    if (errors.length > 0) {
      console.log(`  ⚡ ${errors.length} network errors — check gateway is running at ${GATEWAY_URL}`);
    }
  }

  console.log('\n  IMPORTANT NOTE');
  console.log('  ' + '─'.repeat(62));
  console.log(`  Gateway accepted (HTTP 200) = push was SENT to the browser push service.`);
  console.log(`  It does NOT confirm the notification appeared on the device.`);
  console.log(`  To confirm device display: check each user's phone/computer for the`);
  console.log(`  "🔔 NoteStandard Push Test" notification.`);
  console.log('═'.repeat(62) + '\n');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
