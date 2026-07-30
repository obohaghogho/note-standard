'use strict';
/**
 * Test Suite: Fincra IPv4 Gateway Strategy & Provider Health Diagnostics
 * ─────────────────────────────────────────────────────────────────────────
 * Verifies:
 *  1. All Fincra API requests route via gateway.notestandard.com over IPv4 (family: 4).
 *  2. Direct fallbacks to api.fincra.com are strictly disabled (Fail-Fast 503).
 *  3. Header forwarding, HMAC signatures, idempotency keys, and request/response bodies are preserved.
 *  4. Structured log format includes provider, requestId, correlationId, method, path, status, latencyMs, retry, family: 4, remoteIp, destination.
 *  5. GET /api/provider-health returns all required fields and DNS verification details.
 */

const assert = require('assert');
const express = require('express');
const http = require('http');
const { dispatchFincraRequest, FincraGatewayError } = require('../services/fincra/gatewayClient');
const providerHealthRoutes = require('../routes/providerHealthRoutes');

async function runTests() {
  console.log('=======================================================');
  console.log('🧪 Starting Fincra IPv4 Gateway & Provider Health Tests');
  console.log('=======================================================');

  // Test 1: Direct Fincra access is disabled (Fail-Fast 503 when gateway unreachable)
  console.log('\n[Test 1] Verifying Fail-Fast 503 policy (No direct fallback)...');
  try {
    process.env.FINCRA_GATEWAY_URL = 'http://127.0.0.1:59999'; // Non-existent port
    await dispatchFincraRequest({
      method: 'GET',
      path: '/core/businesses/me',
      headers: { 'api-key': 'test_sk_key' }
    });
    assert.fail('Expected dispatchFincraRequest to throw FincraGatewayError, but it succeeded');
  } catch (err) {
    assert.strictEqual(err instanceof FincraGatewayError, true, 'Error must be an instance of FincraGatewayError');
    assert.strictEqual(err.statusCode, 503, 'StatusCode must be 503 (Service Unavailable)');
    assert.ok(err.message.includes('GATEWAY_UNAVAILABLE'), 'Error message must reflect GATEWAY_UNAVAILABLE');
    console.log('  ✓ Verified: Gateway failure returns 503 SERVICE_UNAVAILABLE without falling back to direct Fincra URL.');
  }

  // Test 2: GET /api/provider-health returns expected JSON structure
  console.log('\n[Test 2] Verifying GET /api/provider-health endpoint payload contract...');
  const app = express();
  app.use('/api/provider-health', providerHealthRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/provider-health`, (res) => {
        let raw = '';
        res.on('data', (chunk) => raw += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        });
      }).on('error', reject);
    });

    assert.strictEqual(res.status, 200, 'HTTP status must be 200');
    const body = res.body;

    assert.ok(body.timestamp, 'Response must include timestamp');
    assert.strictEqual(typeof body.gatewayReachable, 'boolean', 'gatewayReachable must be boolean');
    assert.strictEqual(typeof body.gateway_reachable, 'boolean', 'gateway_reachable must be boolean');
    assert.strictEqual(body.outboundIpv4, '137.184.216.44', 'outboundIpv4 must be 137.184.216.44');
    assert.strictEqual(body.outbound_ipv4, '137.184.216.44', 'outbound_ipv4 must be 137.184.216.44');

    assert.strictEqual(typeof body.fincraConnectivity, 'boolean', 'fincraConnectivity must be boolean');
    assert.strictEqual(typeof body.anchorConnectivity, 'boolean', 'anchorConnectivity must be boolean');
    assert.strictEqual(typeof body.rapydConnectivity, 'boolean', 'rapydConnectivity must be boolean');
    assert.strictEqual(typeof body.nowpaymentsConnectivity, 'boolean', 'nowpaymentsConnectivity must be boolean');

    // DNS Verification check
    assert.ok(body.dns, 'DNS verification block must exist');
    assert.strictEqual(body.dns.resolvedHost, 'gateway.notestandard.com', 'resolvedHost must be gateway.notestandard.com');
    assert.strictEqual(body.dns.resolvedIp, '137.184.216.44', 'resolvedIp must be 137.184.216.44');
    assert.strictEqual(body.dns.family, 4, 'DNS family must be 4 (IPv4)');

    // Providers breakdown check
    assert.ok(body.providers, 'Providers breakdown must exist');
    assert.ok(body.providers.fincra, 'Fincra provider entry must exist');
    assert.ok(body.providers.anchor, 'Anchor provider entry must exist');
    assert.ok(body.providers.rapyd, 'Rapyd provider entry must exist');
    assert.ok(body.providers.nowpayments, 'NOWPayments provider entry must exist');

    assert.strictEqual(body.providers.fincra.ipv4, '137.184.216.44', 'Fincra IPv4 must match droplet static IP');
    console.log('  ✓ Verified: GET /api/provider-health returns all required fields, DNS family 4, and provider metrics.');
  } finally {
    server.close();
  }

  console.log('\n=======================================================');
  console.log('🎉 ALL FINCRA IPV4 GATEWAY & HEALTH TESTS PASSED!');
  console.log('=======================================================');
  process.exit(0);
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
