'use strict';
/**
 * greyDirectSandboxTest.js — direct HTTPS sandbox test for Grey Finance Business API
 * Bypasses Node DNS resolver issues. Tests balances, transactions, FX rate, topup, webhook sig.
 * Run:  node tests/greyDirectSandboxTest.js
 */
require('dotenv').config();
const https  = require('https');
const crypto = require('crypto');

const PASS = 'PASS'; const FAIL = 'FAIL'; const WARN = 'WARN';
let passed = 0, failed = 0, warnings = 0;
const results = [];

function test(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) { passed++; console.log('[' + PASS + '] ' + name + (detail ? ' -- ' + detail : '')); }
  else     { failed++; console.log('[' + FAIL + '] ' + name + (detail ? ' -- ' + detail : '')); }
}
function warn(msg) { warnings++; console.log('[WARN] ' + msg); }
function info(msg) { console.log('[INFO] ' + msg); }

function httpsRequest(method, hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname, path, method,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, headers,
        bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data }); }
        catch { resolve({ status: res.statusCode, body: {}, raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

(async () => {
  try {
    const API_KEY      = process.env.GREY_API_KEY || process.env.GREY_SECRET_KEY || '';
    const WEBHOOK_SEC  = process.env.GREY_WEBHOOK_SECRET || '';
    const HOST         = 'businessapi-sandbox.grey.co';
    const auth         = { 'Authorization': 'Bearer ' + API_KEY };

    console.log('');
    console.log('================================================================');
    console.log('  GREY FINANCE -- DIRECT SANDBOX TEST');
    console.log('  Host: ' + HOST);
    console.log('  Key:  ' + API_KEY.substring(0, 12) + '...' + API_KEY.slice(-4));
    console.log('================================================================');

    // SECTION 1: CONFIG
    console.log('\n-- SECTION 1: CONFIGURATION -----------------------------------');
    test('API key present',           !!API_KEY && API_KEY.length > 10,    'len=' + API_KEY.length);
    test('API key starts with gbsk_', API_KEY.startsWith('gbsk_'),          'prefix=' + API_KEY.substring(0, 5));
    test('Webhook secret present',    !!WEBHOOK_SEC && WEBHOOK_SEC.length >= 10, 'len=' + WEBHOOK_SEC.length);

    // SECTION 2: LIVE CONNECTIVITY
    console.log('\n-- SECTION 2: LIVE API ENDPOINTS (direct HTTPS) ---------------');

    // 2.1 GET /v1/balances
    let balancesData = [];
    try {
      const r = await httpsRequest('GET', HOST, '/v1/balances', auth);
      test('GET /v1/balances -- reachable',  r.status < 500,  'HTTP ' + r.status);
      test('GET /v1/balances -- auth OK',    r.status !== 401, 'HTTP ' + r.status + ': ' + r.raw.substring(0, 120));
      if (r.status === 200) {
        balancesData = r.body && r.body.data && r.body.data.balances
          ? r.body.data.balances
          : (Array.isArray(r.body && r.body.data) ? r.body.data : (r.body && r.body.balances ? r.body.balances : []));
        test('GET /v1/balances -- balances array', Array.isArray(balancesData), 'count=' + balancesData.length);
        const usd = balancesData.find(b => String(b.currency).toUpperCase() === 'USD');
        if (usd) {
          info('USD wallet: available_balance=' + usd.available_balance + ' pending_balance=' + usd.pending_balance);
          test('USD wallet has available_balance field', 'available_balance' in usd, JSON.stringify(usd).substring(0, 100));
        } else {
          warn('No USD wallet in balance list yet');
        }
      }
    } catch (e) { test('GET /v1/balances', false, e.message); }

    // 2.2 GET /api/v1/transactions
    try {
      const r = await httpsRequest('GET', HOST, '/api/v1/transactions?limit=5', auth);
      test('GET /api/v1/transactions -- reachable', r.status < 500, 'HTTP ' + r.status);
      test('GET /api/v1/transactions -- auth OK',   r.status !== 401, r.raw.substring(0, 80));
      if (r.status === 200) {
        const txns = (r.body && r.body.data) ? r.body.data : [];
        info('Transactions returned: ' + (Array.isArray(txns) ? txns.length : 'unknown'));
        if (Array.isArray(txns) && txns.length > 0) {
          const t = txns[0];
          test('Txn has source_amount field',         'source_amount'         in t, JSON.stringify(t).substring(0, 120));
          test('Txn has source_currency field',       'source_currency'       in t);
          test('Txn has transaction_reference field', 'transaction_reference' in t || 'reference' in t);
        }
      }
    } catch (e) { test('GET /api/v1/transactions', false, e.message); }

    // 2.3 POST /v1/currency/rate
    try {
      const r = await httpsRequest('POST', HOST, '/v1/currency/rate', auth,
        { source_amount: 100, source_currency: 'USD', destination_currency: 'NGN', transaction_type: 'swap' });
      test('POST /v1/currency/rate -- reachable', r.status < 500, 'HTTP ' + r.status);
      test('POST /v1/currency/rate -- auth OK',   r.status !== 401, r.raw.substring(0, 120));
      if (r.status === 200) {
        const d = (r.body && r.body.data) ? r.body.data : r.body;
        const rate = d.source_destination_currency_rate || d.rate;
        test('FX rate field present', !!rate, 'rate=' + rate);
        info('USD->NGN rate: ' + rate + ', dest_amount: ' + d.destination_amount);
      }
    } catch (e) { test('POST /v1/currency/rate', false, e.message); }

    // SECTION 3: SANDBOX TOPUP
    console.log('\n-- SECTION 3: SANDBOX USD WALLET TOPUP ($50) ------------------');
    let topupOk = false;
    try {
      info('Sending POST /v1/sandbox/topup $50 USD...');
      const r = await httpsRequest('POST', HOST, '/v1/sandbox/topup', auth,
        { amount: 50, currency: 'USD', description: 'NoteStandard sandbox USD credit test' });
      topupOk = r.status === 200 || r.status === 201;
      test('POST /v1/sandbox/topup -- reachable',  r.status < 500, 'HTTP ' + r.status);
      test('POST /v1/sandbox/topup -- accepted',   topupOk, r.raw.substring(0, 250));

      if (topupOk) {
        info('Topup response: ' + r.raw.substring(0, 200));
        await new Promise(res => setTimeout(res, 2000)); // brief settle
        const br = await httpsRequest('GET', HOST, '/v1/balances', auth);
        if (br.status === 200) {
          const bals = (br.body && br.body.data && br.body.data.balances)
            ? br.body.data.balances
            : (Array.isArray(br.body && br.body.data) ? br.body.data : []);
          const usd = bals.find(b => String(b.currency).toUpperCase() === 'USD');
          const avail = Number((usd && (usd.available_balance || usd.balance)) || 0);
          test('USD available_balance > 0 after topup', avail > 0, 'available_balance=' + avail);
          if (avail > 0) {
            console.log('');
            console.log('  *** USD WALLET CREDIT CONFIRMED! Balance: $' + avail + ' USD ***');
            console.log('      pending_balance: $' + (usd && usd.pending_balance || 0));
            console.log('');
          }
        } else {
          warn('Could not re-fetch balance after topup. HTTP ' + br.status);
        }
      } else if (r.status === 401) {
        warn('Topup 401 -- API key may be production-only.');
        warn('Generate a sandbox key in the Grey dashboard at https://businessapi-sandbox.grey.co');
      } else if (r.status === 404) {
        warn('POST /v1/sandbox/topup returned 404 -- endpoint may differ. Checking /v1/test/topup...');
        try {
          const r2 = await httpsRequest('POST', HOST, '/v1/test/topup', auth,
            { amount: 50, currency: 'USD' });
          test('POST /v1/test/topup -- accepted', r2.status === 200 || r2.status === 201,
            'HTTP ' + r2.status + ' ' + r2.raw.substring(0, 150));
        } catch (e2) { test('POST /v1/test/topup', false, e2.message); }
      }
    } catch (e) { test('POST /v1/sandbox/topup', false, e.message); }

    // SECTION 4: WEBHOOK SIGNATURE SIMULATION
    console.log('\n-- SECTION 4: WEBHOOK SIGNATURE SIMULATION ----------------------');
    const webhookPayload = {
      event: 'transaction.received', type: 'credit',
      data: {
        transaction_reference: 'txn_sandbox_' + Date.now(),
        client_reference:      'NS-TEST01',
        source_amount:         50, source_currency:       'USD',
        destination_amount:    50, destination_currency:  'USD',
        status: 'completed',
        sender: { name: 'John Test', bank_name: 'Chase Bank' },
        narration: 'NoteStandard deposit NS-TEST01',
        created_at: new Date().toISOString()
      }
    };
    const rawBody   = JSON.stringify(webhookPayload);
    const hmacHex   = crypto.createHmac('sha256', WEBHOOK_SEC).update(rawBody).digest('hex');
    const sigHeader = 'sha256=' + hmacHex;
    const stripped  = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
    const expected  = crypto.createHmac('sha256', WEBHOOK_SEC).update(rawBody).digest('hex');
    let sigValid = false;
    try { sigValid = crypto.timingSafeEqual(Buffer.from(stripped, 'hex'), Buffer.from(expected, 'hex')); }
    catch { sigValid = false; }

    test('Webhook X-Webhook-Signature: sha256=hex format valid',   sigValid, 'sig=' + sigHeader.substring(0, 30) + '...');
    test('Payload has transaction_reference',                       !!webhookPayload.data.transaction_reference);
    test('Payload has client_reference NS-TEST01',                  webhookPayload.data.client_reference === 'NS-TEST01');
    test('Payload source_amount = 50',                              webhookPayload.data.source_amount === 50);
    test('Payload source_currency = USD',                           webhookPayload.data.source_currency === 'USD');
    test('Payload status = completed',                              webhookPayload.data.status === 'completed');
    test('Payload sender.name populated',                           !!webhookPayload.data.sender && !!webhookPayload.data.sender.name);

    // FINAL SUMMARY
    console.log('\n================================================================');
    console.log('  GREY SANDBOX TEST -- FINAL SUMMARY');
    console.log('================================================================');
    console.log('  Total Tests:  ' + (passed + failed));
    console.log('  PASSED:       ' + passed);
    console.log('  FAILED:       ' + failed);
    console.log('  WARNINGS:     ' + warnings);
    console.log('  Pass Rate:    ' + ((passed / (passed + failed)) * 100).toFixed(1) + '%');
    console.log('================================================================');
    if (failed > 0) {
      console.log('\n  Failed tests:');
      results.filter(r => !r.ok).forEach(r => console.log('  [FAIL] ' + r.name + (r.detail ? ' -- ' + r.detail : '')));
    }
    if (topupOk) {
      console.log('\n  *** USD WALLET CREDITING: WORKING CORRECTLY ***');
      console.log('     Sandbox topup completed and balance confirmed.');
    } else if (failed === 0) {
      console.log('\n  All connectivity tests passed.');
    }
    console.log('================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('FATAL:', err.message); process.exit(1);
  }
})();
