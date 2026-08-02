'use strict';

/**
 * paymentMethodDiscovery.test.js
 * ==============================
 * Payment Method Discovery API Test Suite.
 */

const assert = require('assert');
const PaymentMethodDiscoveryService = require('../services/payment/PaymentMethodDiscoveryService');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function runDiscoveryTests() {
  console.log('==================================================================');
  console.log('🔍 Running Payment Method Discovery API Test Suite (v1.0)');
  console.log('==================================================================');

  const discovery = new PaymentMethodDiscoveryService();

  // TEST 1 — Discover NGN Nigeria Payin Methods
  section('TEST 1 — GET /api/payments/methods?country=NG&currency=NGN');
  const ngnRes = await discovery.getSupportedMethods({ country: 'NG', currency: 'NGN', direction: 'payin' });
  assert.strictEqual(ngnRes.currency, 'NGN');
  assert.ok(ngnRes.methods.some(m => m.type === 'CARDS' && m.status === 'enabled'));
  assert.ok(ngnRes.methods.some(m => m.type === 'BANK_TRANSFER' && m.status === 'enabled'));
  console.log(`✓ NGN Payin methods discovered: ${ngnRes.methods.map(m => `${m.type} (${m.status})`).join(', ')}`);

  // TEST 2 — Discover GBP United Kingdom Payin Methods (Pending Approval / Coming Soon)
  section('TEST 2 — GET /api/payments/methods?country=GB&currency=GBP');
  const gbpRes = await discovery.getSupportedMethods({ country: 'GB', currency: 'GBP', direction: 'payin' });
  assert.strictEqual(gbpRes.currency, 'GBP');
  assert.ok(gbpRes.methods.some(m => m.status === 'pending_approval' && m.badge === 'Coming Soon'));
  console.log(`✓ GBP Pending Payin methods discovered: ${gbpRes.methods.map(m => `${m.type} (${m.badge})`).join(', ')}`);

  console.log('\n==================================================================');
  console.log('🎉 ALL PAYMENT METHOD DISCOVERY TESTS PASSED 100%!');
  console.log('==================================================================');
}

runDiscoveryTests().catch(err => {
  console.error('❌ Discovery Test failed:', err);
  process.exit(1);
});
