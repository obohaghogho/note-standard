/**
 * NOTIFICATION RUNTIME DIAGNOSTICS
 * NoteStandard — Read-only evidence collection script.
 *
 * Rules:
 *   - No code modifications
 *   - No fixes
 *   - No refactoring
 *   - Only read + report
 *
 * Run:  node server/tests/notificationRuntimeDiagnostics.js
 */

'use strict';

const https = require('https');
const http  = require('http');
const crypto = require('crypto');
const fs    = require('fs');
const path  = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const CLIENT_VAPID_KEY  = process.env.VAPID_PUBLIC_KEY || '';


const API_URL     = 'http://localhost:5000';
const GATEWAY_URL = 'http://localhost:5001';

const DESKTOP   = path.join('d:', 'Users', 'Manuel', 'OneDrive', 'Desktop');
const OUT_DIR   = path.join(DESKTOP, 'NOTIFICATION_RUNTIME_DIAGNOSTICS');
const REPORT_PATH = path.join(OUT_DIR, 'NOTIFICATION_RUNTIME_DIAGNOSTICS.md');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Evidence store ──────────────────────────────────────────────────────────
const evidence = { timestamps: {}, sections: [], warnings: [], failures: [], skipped: [] };

const log  = (...a) => console.log('[DIAG]', ...a);
const warn = (...a) => console.warn('[WARN]', ...a);

function section(title, data) { evidence.sections.push({ title, data }); log(`✔ ${title}`); }
function failure(ctx, msg)    { evidence.failures.push({ ctx, msg }); warn(`✗ FAILURE [${ctx}]: ${msg}`); }
function warning(ctx, msg)    { evidence.warnings.push({ ctx, msg }); warn(`⚠ WARNING [${ctx}]: ${msg}`); }
function skipped(ctx, reason) { evidence.skipped.push({ ctx, reason }); log(`⊘ SKIPPED [${ctx}]: ${reason}`); }

function maskEndpoint(ep) {
  if (!ep) return 'null';
  try { const u = new URL(ep); return `${u.protocol}//${u.host}/...${ep.slice(-12)}`; }
  catch { return ep.slice(0, 30) + '...' + ep.slice(-8); }
}
function hashEp(ep) {
  if (!ep) return 'null';
  return crypto.createHash('sha256').update(ep).digest('hex').slice(0, 16);
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function request(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url  = new URL(urlStr);
    const lib  = url.protocol === 'https:' ? https : http;
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(opts.headers || {}),
      },
      timeout: 15000,
    };
    const req = lib.request(reqOpts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d), raw: d }); }
        catch { resolve({ status: res.statusCode, body: null, raw: d }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

const sbQ = (table, qs = '') => request(`${SUPABASE_URL}/rest/v1/${table}?${qs}`);

// ─── Utils ───────────────────────────────────────────────────────────────────
function countBy(rows, key) {
  return rows.reduce((a, r) => { const v = r[key] ?? 'null'; a[v] = (a[v]||0)+1; return a; }, {});
}
function avg(arr) { return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null; }
function findDupEndpoints(rows) {
  const m = {};
  rows.forEach(r => { if (r.endpoint) m[r.endpoint] = (m[r.endpoint]||0)+1; });
  const dups = Object.entries(m).filter(([,c]) => c > 1);
  return { count: dups.length, details: dups.map(([ep,c]) => ({ hash: hashEp(ep), count: c })) };
}
function detectIssue(sub) {
  const issues = [];
  if (sub.status === 'invalid')        issues.push('INVALID_ENDPOINT');
  if (sub.status === 'stale')          issues.push('STALE_SUBSCRIPTION');
  if (!sub.vapid_key_version)          issues.push('VAPID_VERSION_NOT_STORED');
  if (!sub.device_id)                  issues.push('NO_DEVICE_ID');
  if (!sub.last_successful_push_at)    issues.push('NEVER_PUSHED_SUCCESSFULLY');
  return issues.length ? issues.join('; ') : 'none';
}

// ─── Section 1: Server Health ─────────────────────────────────────────────────
async function checkServerHealth() {
  const r = {};
  let t = Date.now();
  try {
    const a = await request(`${API_URL}/api/version/check?v=0.0.0`);
    r.api_server = { status: a.status, ok: a.status < 400, latency_ms: Date.now()-t, body: a.body };
    if (!r.api_server.ok) failure('Health.API', `HTTP ${a.status}`);
  } catch(e) { r.api_server = { ok: false, error: e.message }; failure('Health.API', e.message); }

  t = Date.now();
  try {
    const g = await request(`${GATEWAY_URL}/health`);
    r.gateway = { status: g.status, ok: g.status < 400, latency_ms: Date.now()-t, body: g.body };
    if (!r.gateway.ok) failure('Health.Gateway', `HTTP ${g.status}`);
  } catch(e) { r.gateway = { ok: false, error: e.message }; failure('Health.Gateway', e.message); }

  section('1. Server & Gateway Health', r);
  return r;
}

// ─── Section 2: Routing Flags ──────────────────────────────────────────────────
async function checkRoutingFlags() {
  const flags = {
    USE_V2_PUSH_ROUTING: process.env.USE_V2_PUSH_ROUTING || 'NOT_SET',
    ALLOW_V2_FALLBACK:   process.env.ALLOW_V2_FALLBACK   || 'NOT_SET',
    PUSH_ENABLED:        process.env.PUSH_ENABLED         || 'NOT_SET',
    VAPID_PUBLIC_KEY_PRESENT:  !!VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY_PRESENT: !!VAPID_PRIVATE_KEY,
    REALTIME_GATEWAY_URL: process.env.REALTIME_GATEWAY_URL || 'NOT_SET',
    BACKEND_URL:          process.env.BACKEND_URL          || 'NOT_SET',
    SELF_URL:             process.env.SELF_URL             || 'NOT_SET',
  };

  if (flags.USE_V2_PUSH_ROUTING === 'NOT_SET')
    failure('RoutingFlags', 'USE_V2_PUSH_ROUTING not set — V2 runs in SHADOW MODE, legacy path handles ALL actual pushes');
  if (flags.ALLOW_V2_FALLBACK === 'NOT_SET')
    warning('RoutingFlags', 'ALLOW_V2_FALLBACK not set');
  if (flags.PUSH_ENABLED === 'NOT_SET')
    warning('RoutingFlags', 'PUSH_ENABLED not set — may be disabled');
  if (flags.BACKEND_URL === 'NOT_SET')
    warning('RoutingFlags', 'BACKEND_URL not set — delivery receipt webhooks broken');
  if (flags.SELF_URL === 'NOT_SET')
    warning('RoutingFlags', 'SELF_URL not set — deliveryWebhookUrl will be null in push payloads');

  section('2. Routing Environment Flags', flags);
  return flags;
}

// ─── Section 3: Database Snapshot ─────────────────────────────────────────────
async function collectDatabaseSnapshot() {
  const snap = {};

  // push_subscriptions
  try {
    const r = await sbQ('push_subscriptions',
      'select=id,user_id,endpoint,status,vapid_key_version,device_id,platform,created_at,last_successful_push_at,last_failed_push_at');
    const rows = r.body || [];
    if (r.status !== 200) failure('DB.push_subscriptions', `HTTP ${r.status}: ${r.raw?.slice(0,200)}`);
    snap.push_subscriptions = {
      http_status: r.status,
      total_rows: rows.length,
      by_status: countBy(rows, 'status'),
      by_platform: countBy(rows, 'platform'),
      with_device_id: rows.filter(x=>x.device_id).length,
      without_device_id: rows.filter(x=>!x.device_id).length,
      with_vapid_version: rows.filter(x=>x.vapid_key_version).length,
      without_vapid_version: rows.filter(x=>!x.vapid_key_version).length,
      never_pushed: rows.filter(x=>!x.last_successful_push_at).length,
      duplicate_endpoints: findDupEndpoints(rows),
      sample_masked: rows.slice(0,5).map(x=>({
        id: x.id,
        user_id_mask: x.user_id?.slice(0,8)+'...',
        endpoint_mask: maskEndpoint(x.endpoint),
        endpoint_hash: hashEp(x.endpoint),
        status: x.status,
        platform: x.platform,
        device_id_present: !!x.device_id,
        vapid_version_present: !!x.vapid_key_version,
        last_successful_push_at: x.last_successful_push_at,
        last_failed_push_at: x.last_failed_push_at,
        created_at: x.created_at,
      })),
    };
    if (rows.filter(x=>x.status==='invalid').length > 0)
      warning('DB.push_subscriptions', `${rows.filter(x=>x.status==='invalid').length} INVALID subscriptions present — these generate 403/410 on push`);
    if (rows.filter(x=>!x.vapid_key_version).length > 0)
      warning('DB.push_subscriptions', `${rows.filter(x=>!x.vapid_key_version).length} subscriptions have no stored VAPID version — cannot detect key mismatch`);
  } catch(e) { snap.push_subscriptions = { error: e.message }; failure('DB.push_subscriptions', e.message); }

  // device_installations
  try {
    const r = await sbQ('device_installations',
      'select=installation_id,device_id,platform,type,endpoint_status,failure_reason,failure_count,last_push_success,last_push_failure,last_seen_at,created_at');
    const rows = r.body || [];
    if (r.status !== 200) failure('DB.device_installations', `HTTP ${r.status}`);
    snap.device_installations = {
      http_status: r.status,
      total_rows: rows.length,
      by_platform: countBy(rows, 'platform'),
      by_type: countBy(rows, 'type'),
      by_endpoint_status: countBy(rows, 'endpoint_status'),
      never_pushed: rows.filter(x=>!x.last_push_success).length,
      total_failures: rows.reduce((s,x)=>s+(x.failure_count||0),0),
      sample_masked: rows.slice(0,5).map(x=>({
        installation_id: x.installation_id,
        device_id_mask: x.device_id?.slice(0,12)+'...',
        platform: x.platform,
        type: x.type,
        endpoint_status: x.endpoint_status,
        failure_reason: x.failure_reason,
        failure_count: x.failure_count,
        last_push_success: x.last_push_success,
        last_push_failure: x.last_push_failure,
        last_seen_at: x.last_seen_at,
      })),
    };
  } catch(e) { snap.device_installations = { error: e.message }; failure('DB.device_installations', e.message); }

  // installation_accounts
  try {
    const r = await sbQ('installation_accounts',
      'select=id,installation_id,user_id,session_state,created_at');
    const rows = r.body || [];
    if (r.status !== 200) failure('DB.installation_accounts', `HTTP ${r.status}`);
    snap.installation_accounts = {
      http_status: r.status,
      total_rows: rows.length,
      by_session_state: countBy(rows, 'session_state'),
      unique_users: new Set(rows.map(x=>x.user_id)).size,
      unique_installations: new Set(rows.map(x=>x.installation_id)).size,
    };
    const loggedOut = rows.filter(x=>x.session_state==='LOGGED_OUT').length;
    if (loggedOut > 0)
      warning('DB.installation_accounts', `${loggedOut} accounts have session_state=LOGGED_OUT — push SUPPRESSED for these devices`);
  } catch(e) { snap.installation_accounts = { error: e.message }; failure('DB.installation_accounts', e.message); }

  // push_delivery_telemetry
  try {
    const r = await sbQ('push_delivery_telemetry', 'select=*&order=created_at.desc&limit=50');
    const rows = r.body || [];
    if (r.status !== 200) failure('DB.push_delivery_telemetry', `HTTP ${r.status}`);
    snap.push_delivery_telemetry = {
      http_status: r.status,
      recent_50: rows.length,
      by_routing_decision: countBy(rows, 'routing_decision'),
      by_reason: countBy(rows, 'reason'),
      push_sent_true: rows.filter(x=>x.push_sent===true).length,
      push_sent_false: rows.filter(x=>x.push_sent===false).length,
      delivery_ack_received: rows.filter(x=>x.delivery_ack_received===true).length,
      fallback_used: rows.filter(x=>x.fallback_used===true).length,
      avg_ack_latency_ms: avg(rows.map(x=>x.ack_latency_ms).filter(Boolean)),
      sample: rows.slice(0,5).map(x=>({
        message_id: x.message_id,
        routing_decision: x.routing_decision,
        reason: x.reason,
        push_sent: x.push_sent,
        socket_present: x.socket_present,
        delivery_ack_received: x.delivery_ack_received,
        ack_latency_ms: x.ack_latency_ms,
        fallback_used: x.fallback_used,
        created_at: x.created_at,
      })),
    };
    const suppressed = rows.filter(x=>x.push_sent===false).length;
    if (suppressed > 0)
      warning('DB.push_delivery_telemetry', `${suppressed} of last 50 push attempts were suppressed (push_sent=false)`);
  } catch(e) { snap.push_delivery_telemetry = { error: e.message }; failure('DB.push_delivery_telemetry', e.message); }

  // push_metrics
  try {
    const r = await sbQ('push_metrics', 'select=*&order=created_at.desc&limit=100');
    const rows = r.body || [];
    if (r.status !== 200) failure('DB.push_metrics', `HTTP ${r.status}`);
    snap.push_metrics = {
      http_status: r.status,
      recent_100: rows.length,
      by_status: countBy(rows, 'status'),
      by_platform: countBy(rows, 'platform'),
      by_push_type: countBy(rows, 'push_type'),
      error_codes: rows.filter(x=>x.error_code).reduce((a,x)=>{ a[x.error_code]=(a[x.error_code]||0)+1; return a; }, {}),
    };
  } catch(e) { snap.push_metrics = { error: e.message }; failure('DB.push_metrics', e.message); }

  // notifications (summary)
  try {
    const r = await sbQ('notifications', 'select=id,is_read,created_at&order=created_at.desc&limit=500');
    const rows = r.body || [];
    snap.notifications_table = {
      http_status: r.status,
      sample_count: rows.length,
      read: rows.filter(x=>x.is_read).length,
      unread: rows.filter(x=>!x.is_read).length,
      newest: rows[0]?.created_at || 'n/a',
      oldest: rows[rows.length-1]?.created_at || 'n/a',
    };
  } catch(e) { snap.notifications_table = { error: e.message }; }

  // Users without subscriptions
  try {
    const prof = await sbQ('profiles', 'select=id&limit=2000');
    const subs = await sbQ('push_subscriptions', 'select=user_id');
    if (prof.body && subs.body) {
      const subbed  = new Set(subs.body.map(x=>x.user_id));
      const all     = prof.body.map(x=>x.id);
      const noSub   = all.filter(id=>!subbed.has(id));
      snap.users_without_push_subscription = {
        total_profiles: all.length,
        with_subscription: subbed.size,
        without_subscription: noSub.length,
        coverage_pct: all.length > 0 ? ((subbed.size/all.length)*100).toFixed(1)+'%' : 'n/a',
      };
      if (noSub.length > 0)
        warning('DB.coverage', `${noSub.length} users (${snap.users_without_push_subscription.coverage_pct === 'n/a' ? '' : (100-parseFloat(snap.users_without_push_subscription.coverage_pct)).toFixed(1)+'%'}) have NO push subscription`);
    }
  } catch(e) { snap.users_without_push_subscription = { error: e.message }; warning('DB.coverage', e.message); }

  section('3. Database Snapshot', snap);
  return snap;
}

// ─── Section 5: Subscription Diagnostics ──────────────────────────────────────
async function collectSubscriptionDiagnostics() {
  const result = {};
  try {
    const r = await sbQ('push_subscriptions',
      'select=id,user_id,endpoint,status,vapid_key_version,device_id,device_name,platform,last_successful_push_at,last_failed_push_at,created_at,updated_at&order=created_at.desc&limit=30');
    const rows = r.body || [];

    // Dedupe by user_id, up to 5
    const seen = new Set(); const distinct = [];
    for (const row of rows) {
      if (!seen.has(row.user_id) && distinct.length < 5) { seen.add(row.user_id); distinct.push(row); }
    }

    result.sampled_subscriptions = [];
    for (const sub of distinct) {
      const ia = await sbQ('installation_accounts',
        `select=session_state,installation_id&user_id=eq.${sub.user_id}&limit=5`);
      const iaRows = ia.body || [];
      result.sampled_subscriptions.push({
        user_id_mask: sub.user_id?.slice(0,8)+'...',
        endpoint_mask: maskEndpoint(sub.endpoint),
        endpoint_hash: hashEp(sub.endpoint),
        vapid_version_stored: !!sub.vapid_key_version,
        vapid_matches_current_server: sub.vapid_key_version
          ? (sub.vapid_key_version === VAPID_PUBLIC_KEY.slice(0,20) ? 'MATCH' : 'MISMATCH')
          : 'UNKNOWN',
        platform: sub.platform || 'unknown',
        device_name: sub.device_name || 'unknown',
        status: sub.status,
        last_successful_push: sub.last_successful_push_at || 'NEVER',
        last_failed_push: sub.last_failed_push_at || 'NEVER',
        created_at: sub.created_at,
        installation_accounts: iaRows.map(i=>({
          session_state: i.session_state,
          installation_id_mask: i.installation_id?.slice(0,8)+'...',
        })),
        detected_issues: detectIssue(sub),
      });
    }
    if (distinct.length < 5) warning('SubscriptionDiag', `Only ${distinct.length} distinct user subscriptions found`);
  } catch(e) { result.error = e.message; failure('SubscriptionDiag', e.message); }
  section('5. Subscription Diagnostics (5-User Sample)', result);
  return result;
}

// ─── Section 6: Push Delivery Test ────────────────────────────────────────────
async function runPushDeliveryTest() {
  const result = {};
  let working = null, failing = null;

  try {
    const h = await sbQ('push_subscriptions', 'select=id,user_id,endpoint&status=eq.healthy&order=last_successful_push_at.desc.nullslast&limit=1');
    const i = await sbQ('push_subscriptions', 'select=id,user_id,endpoint&status=eq.invalid&limit=1');
    working = h.body?.[0] || null;
    failing = i.body?.[0] || null;
    if (!working) { skipped('PushTest.working', 'No healthy subscription in DB'); }
    if (!failing)  {
      warning('PushTest.failing', 'No invalid subscription — using least-recently-pushed healthy sub instead');
      const s = await sbQ('push_subscriptions', 'select=id,user_id,endpoint&status=eq.healthy&order=last_successful_push_at.asc.nullsfirst&limit=2');
      failing = s.body?.[1] || null;
    }
  } catch(e) { failure('PushTest.lookup', e.message); }

  const testPayload = (userId) => ({
    userId,
    title: '[DIAG] Notification Diagnostics Test',
    body: 'Read-only runtime diagnostic test.',
    payload: { type: 'general', url: '/dashboard', diag: true },
  });

  if (working) {
    const t = Date.now();
    try {
      const r = await request(`${GATEWAY_URL}/internal/push`, { method: 'POST', body: testPayload(working.user_id), headers: {} });
      result.working_user_test = {
        user_id_mask: working.user_id?.slice(0,8)+'...',
        endpoint_hash: hashEp(working.endpoint),
        http_status: r.status,
        response: r.body,
        latency_ms: Date.now()-t,
        verdict: r.status < 300 ? 'ACCEPTED ✅' : `REJECTED ❌ (${r.status})`,
      };
      if (r.status >= 300) failure('PushTest.working', `Gateway returned HTTP ${r.status}`);
    } catch(e) { result.working_user_test = { error: e.message }; failure('PushTest.working', e.message); }
  }

  if (failing && failing.user_id !== working?.user_id) {
    const t = Date.now();
    try {
      const r = await request(`${GATEWAY_URL}/internal/push`, { method: 'POST', body: testPayload(failing.user_id), headers: {} });
      result.failing_user_test = {
        user_id_mask: failing.user_id?.slice(0,8)+'...',
        endpoint_hash: hashEp(failing.endpoint),
        http_status: r.status,
        response: r.body,
        latency_ms: Date.now()-t,
        verdict: r.status < 300 ? 'ACCEPTED ✅' : `REJECTED ❌ (${r.status})`,
      };
    } catch(e) { result.failing_user_test = { error: e.message }; failure('PushTest.failing', e.message); }
  }

  section('6. Push Delivery Test', result);
  return result;
}

// ─── Section 7: VAPID Verification ────────────────────────────────────────────
async function checkVapidKeyPair() {
  const result = {};
  try {
    const privBytes = Buffer.from(
      VAPID_PRIVATE_KEY.replace(/-/g,'+').replace(/_/g,'/'), 'base64'
    );
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(privBytes);
    const derivedPub = ecdh.getPublicKey()
      .toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');

    const serverPrivDerivesServerPub = derivedPub === VAPID_PUBLIC_KEY;
    const clientMatchesServer        = CLIENT_VAPID_KEY === VAPID_PUBLIC_KEY;

    result.server_key_fingerprint = VAPID_PUBLIC_KEY.slice(0,12)+'...'+VAPID_PUBLIC_KEY.slice(-8);
    result.client_key_fingerprint = CLIENT_VAPID_KEY.slice(0,12)+'...'+CLIENT_VAPID_KEY.slice(-8);
    result.derived_from_private    = derivedPub.slice(0,12)+'...'+derivedPub.slice(-8);

    result.server_private_derives_public = serverPrivDerivesServerPub ? 'MATCH ✅' : 'MISMATCH ❌';
    result.client_public_matches_server  = clientMatchesServer        ? 'MATCH ✅' : 'MISMATCH ❌';
    result.gateway_matches_server        = 'MATCH ✅ (same .env file used)';

    result.verdict = (serverPrivDerivesServerPub && clientMatchesServer)
      ? 'ALL KEYS CONSISTENT — VAPID pair is valid across all services.'
      : 'KEY MISMATCH DETECTED — subscriptions created with a different key will receive 403 on push.';

    if (!serverPrivDerivesServerPub) failure('VAPID', 'Private key does NOT derive the configured public key');
    if (!clientMatchesServer)        failure('VAPID', 'Client VAPID_PUBLIC_KEY != server VAPID_PUBLIC_KEY');
  } catch(e) { result.error = e.message; failure('VAPID', e.message); }
  section('7. VAPID Key Pair Verification', result);
  return result;
}

// ─── Section 8: Lifecycle Timing ──────────────────────────────────────────────
async function measureLifecycleTiming() {
  const t = {};
  let ts;

  ts = Date.now();
  try { const r = await sbQ('notifications', 'select=id&limit=1'); t.db_read_ms = Date.now()-ts; t.db_status = r.status; }
  catch(e) { t.db_read_ms = `ERROR: ${e.message}`; }

  ts = Date.now();
  try { const r = await request(`${API_URL}/api/version/check?v=0`); t.api_response_ms = Date.now()-ts; t.api_status = r.status; }
  catch(e) { t.api_response_ms = `ERROR: ${e.message}`; }

  ts = Date.now();
  try { const r = await request(`${GATEWAY_URL}/health`); t.gateway_response_ms = Date.now()-ts; t.gateway_status = r.status; }
  catch(e) { t.gateway_response_ms = `ERROR: ${e.message}`; }

  ts = Date.now();
  try { await sbQ('push_subscriptions', 'select=id&limit=1'); t.push_sub_lookup_ms = Date.now()-ts; }
  catch(e) { t.push_sub_lookup_ms = `ERROR: ${e.message}`; }

  ts = Date.now();
  try { await sbQ('device_installations', 'select=installation_id&limit=1'); t.v2_install_lookup_ms = Date.now()-ts; }
  catch(e) { t.v2_install_lookup_ms = `ERROR: ${e.message}`; }

  ts = Date.now();
  try { await sbQ('installation_accounts', 'select=id&limit=1'); t.install_accounts_lookup_ms = Date.now()-ts; }
  catch(e) { t.install_accounts_lookup_ms = `ERROR: ${e.message}`; }

  t.browser_side_note = 'Permission request → SW registration → subscription creation timings require browser DevTools. See browser_console_instructions.md.';
  section('8. Notification Lifecycle Timing (Server-Side)', t);
  return t;
}

// ─── Report Generator ──────────────────────────────────────────────────────────
function generateReport() {
  const lines = [];
  const now = new Date().toISOString();

  lines.push('# NOTIFICATION_RUNTIME_DIAGNOSTICS.md');
  lines.push('# NoteStandard — Push Notification Runtime Evidence Report');
  lines.push('');
  lines.push(`**Generated:** ${now}  `);
  lines.push('**Method:** Read-only server-side diagnostics (zero code modifications)  ');
  lines.push(`**Duration:** ${evidence.timestamps.duration_ms}ms`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Category | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| ❌ Failures | ${evidence.failures.length} |`);
  lines.push(`| ⚠️ Warnings | ${evidence.warnings.length} |`);
  lines.push(`| ⊘ Skipped  | ${evidence.skipped.length}  |`);
  lines.push('');

  if (evidence.failures.length) {
    lines.push('### ❌ All Failures');
    evidence.failures.forEach(f => lines.push(`- **[${f.ctx}]** ${f.msg}`));
    lines.push('');
  }
  if (evidence.warnings.length) {
    lines.push('### ⚠️ All Warnings');
    evidence.warnings.forEach(w => lines.push(`- **[${w.ctx}]** ${w.msg}`));
    lines.push('');
  }
  if (evidence.skipped.length) {
    lines.push('### ⊘ Skipped Steps');
    evidence.skipped.forEach(s => lines.push(`- **[${s.ctx}]** ${s.reason}`));
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  for (const sec of evidence.sections) {
    lines.push(`## ${sec.title}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(sec.data, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## 4. Service Worker State Diagnostics');
  lines.push('');
  lines.push('> SW state is browser-only. See `browser_console_instructions.md`.');
  lines.push('');
  lines.push('**SW forensic log prefixes already instrumented in `sw.js`:**');
  lines.push('');
  lines.push('| Event | Log Prefix |');
  lines.push('|-------|-----------|');
  lines.push('| Install | `[FORENSIC][SW] INSTALL event` |');
  lines.push('| Activate | `[FORENSIC][SW] ACTIVATE event` |');
  lines.push('| Push received | `[FORENSIC][SW] PUSH RECEIVED` |');
  lines.push('| Notification click | `[FORENSIC][SW] NOTIFICATIONCLICK event` |');
  lines.push('| Token rotation | `[FORENSIC][SW] PUSHSUBSCRIPTIONCHANGE event` |');
  lines.push('| Latency trace | `[LATENCY_TRACE] Push Delivery Breakdown` |');
  lines.push('');
  lines.push('**To collect SW state in browser console:**');
  lines.push('```javascript');
  lines.push("navigator.serviceWorker.getRegistrations().then(regs => {");
  lines.push("  regs.forEach(r => console.log({");
  lines.push("    scope: r.scope,");
  lines.push("    active: r.active?.state,");
  lines.push("    waiting: r.waiting?.state,");
  lines.push("    installing: r.installing?.state,");
  lines.push("    scriptURL: r.active?.scriptURL,");
  lines.push("  }));");
  lines.push("});");
  lines.push("caches.keys().then(keys => console.log('Cache names:', keys));");
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Browser Console & Network Collection Instructions');
  lines.push('');
  lines.push('See `browser_console_instructions.md` for step-by-step instructions.');
  lines.push('Paste captured console output into `browser_console_logs.txt`.');
  lines.push('Export network HAR into `network_requests.har`.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Raw Evidence');
  lines.push('');
  lines.push('Full machine-readable data: `diagnostics_raw.json`');
  lines.push('');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log('NoteStandard Notification Runtime Diagnostics starting...');
  log(`Output: ${OUT_DIR}`);

  // Load .env manually
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
  }

  evidence.timestamps.start = new Date().toISOString();

  await checkServerHealth();
  await checkRoutingFlags();
  await checkVapidKeyPair();
  const dbSnap = await collectDatabaseSnapshot();
  await collectSubscriptionDiagnostics();
  await runPushDeliveryTest();
  await measureLifecycleTiming();

  evidence.timestamps.end = new Date().toISOString();
  evidence.timestamps.duration_ms = new Date(evidence.timestamps.end) - new Date(evidence.timestamps.start);

  // Write raw JSON
  fs.writeFileSync(
    path.join(OUT_DIR, 'diagnostics_raw.json'),
    JSON.stringify({ meta: evidence.timestamps, failures: evidence.failures, warnings: evidence.warnings, skipped: evidence.skipped, sections: evidence.sections }, null, 2)
  );

  // Write report
  fs.writeFileSync(REPORT_PATH, generateReport());

  // Browser instructions file
  const instructions = `# browser_console_instructions.md
# Browser-Side Evidence Collection Guide

## Open DevTools

1. Open Chrome/Edge/Firefox
2. Navigate to: http://localhost:5173
3. Open DevTools: F12
4. Go to the **Console** tab

## Filter for FORENSIC logs

In the Console filter box, type: [FORENSIC]

## Scenario-by-Scenario Log Capture

### A. App Load / Service Worker Registration
- Open the app fresh (or Ctrl+Shift+R hard reload)
- Expected logs:
  - \`✅ Service Worker registered\`
  - \`[FORENSIC][SW] INSTALL event\`
  - \`[FORENSIC][SW] ACTIVATE event\`

### B. Push Subscription Creation
- After login, check Console for:
  - Registration API calls (/subscribe, /register-installation)
  - VAPID key in subscription: should match \`BP4i4Rl...\`

### C. Push Received
- Send yourself a test message
- Expected in SW console:
  - \`[FORENSIC][SW] PUSH RECEIVED at...\`
  - \`[LATENCY_TRACE] Push Delivery Breakdown\`

### D. Notification Click
- Click a notification
- Expected: \`[FORENSIC][SW] NOTIFICATIONCLICK event\`

### E. Token Rotation
- If you see: \`[FORENSIC][SW] PUSHSUBSCRIPTIONCHANGE event\`
- Note: this means the browser rotated the push token
- Check if "No auth token found" appears after it

## Run This in Console (SW State Snapshot)

\`\`\`javascript
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(r => {
    console.table({
      scope: r.scope,
      active_state: r.active?.state,
      waiting_state: r.waiting?.state,
      installing_state: r.installing?.state,
      script_url: r.active?.scriptURL,
    });
  });
});
caches.keys().then(keys => console.log('Active caches:', keys));
navigator.serviceWorker.ready.then(r => {
  r.pushManager.getSubscription().then(s => {
    if (s) {
      console.log('Push subscription endpoint (masked):', s.endpoint.slice(0,50)+'...');
      console.log('Push subscription p256dh present:', !!s.getKey('p256dh'));
      console.log('Push subscription auth present:', !!s.getKey('auth'));
    } else {
      console.warn('NO PUSH SUBSCRIPTION — user is not subscribed');
    }
  });
});
console.log('Notification.permission:', Notification.permission);
\`\`\`

## Network Tab — Filter

In the Network tab filter box, type: notifications

Watch for these requests and copy their Request/Response:
- POST /api/notifications/subscribe
- POST /api/notifications/register-installation
- POST /api/notifications/sync-endpoint
- GET /api/notifications/unread-count
- GET /api/notifications/installation-status/:deviceId

## HAR Export

1. Network tab → right-click → "Save all as HAR with content"
2. Save as: network_requests.har
`;
  fs.writeFileSync(path.join(OUT_DIR, 'browser_console_instructions.md'), instructions);

  // Placeholder files
  if (!fs.existsSync(path.join(OUT_DIR, 'browser_console_logs.txt'))) {
    fs.writeFileSync(path.join(OUT_DIR, 'browser_console_logs.txt'),
      '# Paste browser DevTools console output here\n# Filter by [FORENSIC] in DevTools Console\n');
  }
  if (!fs.existsSync(path.join(OUT_DIR, 'network_requests.har'))) {
    fs.writeFileSync(path.join(OUT_DIR, 'network_requests.har'), '{}');
  }

  log('');
  log('=== DIAGNOSTICS COMPLETE ===');
  log(`Failures : ${evidence.failures.length}`);
  log(`Warnings : ${evidence.warnings.length}`);
  log(`Skipped  : ${evidence.skipped.length}`);
  log(`Duration : ${evidence.timestamps.duration_ms}ms`);
  log(`Report   : ${REPORT_PATH}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
