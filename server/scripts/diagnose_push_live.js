/**
 * Live push diagnosis:
 * 1. Check push subscriptions for both Stephen and Aghogho in DB
 * 2. Hit gateway /internal/push/health
 * 3. Hit gateway /internal/push/diagnose for Aghogho's ID
 * 4. Check native_device_tokens for Aghogho
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });

const supabase = require('../config/database');
const https = require('https');

const STEPHEN_ID = '4697b099-c688-4e79-aebc-1649d101f42e';
const AGHOGHO_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd'; // from pg_notify log: room=8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd

const GATEWAY_URL = process.env.REALTIME_GATEWAY_URL || 'https://realtime-gateway-gsb5.onrender.com';

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const payloadStr = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr),
      },
      timeout: 20000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(payloadStr);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('PUSH NOTIFICATION LIVE DIAGNOSTIC');
  console.log('='.repeat(70));

  // 1. Check push_subscriptions for Stephen
  console.log('\n[1] Stephen push_subscriptions:');
  const { data: stephenSubs, error: se1 } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, status, vapid_key_version, last_successful_push_at, last_failed_push_at, created_at')
    .eq('user_id', STEPHEN_ID);
  if (se1) console.error('  Error:', se1.message);
  else if (!stephenSubs || stephenSubs.length === 0) console.log('  ⚠️  NO push_subscriptions for Stephen!');
  else stephenSubs.forEach(s => console.log(`  endpoint: ${s.endpoint.substring(0, 60)}... | status: ${s.status} | vapid_ver: ${s.vapid_key_version?.substring(0, 30)}... | last_ok: ${s.last_successful_push_at} | last_fail: ${s.last_failed_push_at}`));

  // 2. Check push_subscriptions for Aghogho
  console.log('\n[2] Aghogho push_subscriptions:');
  const { data: aghoghoSubs, error: ae1 } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, status, vapid_key_version, last_successful_push_at, last_failed_push_at, created_at')
    .eq('user_id', AGHOGHO_ID);
  if (ae1) console.error('  Error:', ae1.message);
  else if (!aghoghoSubs || aghoghoSubs.length === 0) console.log('  ⚠️  NO push_subscriptions for Aghogho!');
  else aghoghoSubs.forEach(s => console.log(`  endpoint: ${s.endpoint.substring(0, 60)}... | status: ${s.status} | vapid_ver: ${s.vapid_key_version?.substring(0, 30)}... | last_ok: ${s.last_successful_push_at} | last_fail: ${s.last_failed_push_at}`));

  // 3. Check native_device_tokens for Aghogho
  console.log('\n[3] Aghogho native_device_tokens:');
  const { data: aghoghoTokens, error: ae2 } = await supabase
    .from('native_device_tokens')
    .select('id, token, platform, type, created_at')
    .eq('user_id', AGHOGHO_ID);
  if (ae2) console.error('  Error:', ae2.message);
  else if (!aghoghoTokens || aghoghoTokens.length === 0) console.log('  ⚠️  NO native_device_tokens for Aghogho!');
  else aghoghoTokens.forEach(t => console.log(`  token: ${t.token.substring(0, 30)}... | platform: ${t.platform} | type: ${t.type}`));

  // 4. Check installation_accounts for Aghogho
  console.log('\n[4] Aghogho installation_accounts:');
  const { data: aghoghoInst, error: ae3 } = await supabase
    .from('installation_accounts')
    .select('*, device_installations(*)')
    .eq('user_id', AGHOGHO_ID);
  if (ae3) console.error('  Error:', ae3.message);
  else if (!aghoghoInst || aghoghoInst.length === 0) console.log('  ⚠️  NO installation_accounts for Aghogho!');
  else aghoghoInst.forEach(i => {
    console.log(`  session_state: ${i.session_state}`);
    const di = i.device_installations;
    if (Array.isArray(di)) {
      di.forEach(d => console.log(`    device: ${d.installation_id} | platform: ${d.platform} | endpoint: ${d.push_endpoint?.substring(0, 40)}... | endpoint_status: ${d.endpoint_status}`));
    } else if (di) {
      console.log(`    device: ${di.installation_id} | platform: ${di.platform} | endpoint: ${di.push_endpoint?.substring(0, 40)}... | endpoint_status: ${di.endpoint_status}`);
    }
  });

  // 5. Gateway push health check
  console.log('\n[5] Gateway push health:');
  try {
    const health = await httpGet(`${GATEWAY_URL}/internal/push/health`);
    console.log(`  Status: ${health.status}`);
    console.log('  Body:', JSON.stringify(health.body, null, 2));
  } catch (e) {
    console.error('  ❌ Health check failed:', e.message);
  }

  // 6. Gateway push diagnose for Aghogho
  console.log('\n[6] Gateway push diagnose for Aghogho:');
  try {
    const diag = await httpPost(`${GATEWAY_URL}/internal/push/diagnose`, {
      userId: AGHOGHO_ID,
      title: 'Test Push',
      body: 'Diagnostic test',
      payload: { type: 'chat_message', conversationId: 'e8e975a4-0797-4fc6-89b5-c5b6f8f268b1' }
    });
    console.log(`  Status: ${diag.status}`);
    if (diag.body?.logs) {
      console.log('  Logs:');
      diag.body.logs.forEach(l => console.log(`    [${l.level}] ${l.msg}`));
    } else {
      console.log('  Body:', JSON.stringify(diag.body, null, 2));
    }
  } catch (e) {
    console.error('  ❌ Diagnose failed:', e.message);
  }

  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSIS COMPLETE');
  console.log('='.repeat(70));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
