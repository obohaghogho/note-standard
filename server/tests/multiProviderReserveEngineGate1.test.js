/**
 * MultiProviderReserveEngine — Gate 1 Layer 8 Freshness Oracle Test Suite
 * =====================================================================
 * Executes deterministic acceptance tests A through K enforcing the 5
 * independent admissibility criteria of the Layer 8 fail-closed oracle.
 *
 * Run with: node server/tests/multiProviderReserveEngineGate1.test.js
 */

'use strict';

const assert = require('assert');
const MultiProviderReserveEngine = require('../services/treasury/MultiProviderReserveEngine');
const { filterEligibleBalances, TTL_MAP_MS } = MultiProviderReserveEngine;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${name}`);
    console.log(`      → ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

console.log('\n=====================================================================');
console.log('  NOTEStandard Gate 1 — Layer 8 Oracle Admissibility Test Suite (A–K)');
console.log('=====================================================================\n');

const FIXED_NOW = 1750000000000; // Fixed deterministic timestamp
const mockNow = () => FIXED_NOW;

const HEALTHY_MAP = {
  FINCRA: 'ONLINE',
  ANCHOR: 'ONLINE',
  NOWPAYMENTS: 'ONLINE'
};

// ── Test A: Fresh Provider (Valid & Online) ──────────────────────────────────
test('Test A — Fresh Provider (Valid timestamp, ONLINE, SUCCESS, non-negative balance)', () => {
  const balances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(FIXED_NOW - 60000).toISOString() // 1 min old (TTL = 15m)
  }];

  const result = filterEligibleBalances(balances, HEALTHY_MAP, mockNow);
  assert.strictEqual(result.length, 1, 'Fresh provider must be ELIGIBLE');
  assert.strictEqual(result[0].available_balance, '10000000');
});

// ── Test B: TTL Expiration ───────────────────────────────────────────────────
test('Test B — TTL Expiration (Age exceeds provider currency TTL)', () => {
  const balances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(FIXED_NOW - (16 * 60 * 1000)).toISOString() // 16 min old (TTL = 15m)
  }];

  const result = filterEligibleBalances(balances, HEALTHY_MAP, mockNow);
  assert.strictEqual(result.length, 0, 'Stale provider (>15m) must be EXCLUDED (0 reserve credit)');
});

// ── Test C: Provider Offline ─────────────────────────────────────────────────
test('Test C — Provider Offline (Status === OFFLINE / UNAVAILABLE)', () => {
  const offlineMap = { FINCRA: 'OFFLINE' };
  const balances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(FIXED_NOW - 60000).toISOString()
  }];

  const result = filterEligibleBalances(balances, offlineMap, mockNow);
  assert.strictEqual(result.length, 0, 'Offline provider must be EXCLUDED');
});

// ── Test D: Failed Sync Status ───────────────────────────────────────────────
test('Test D — Failed Sync Status (sync_status !== SUCCESS)', () => {
  const balances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'FAILED',
    last_synced_at: new Date(FIXED_NOW - 60000).toISOString()
  }];

  const result = filterEligibleBalances(balances, HEALTHY_MAP, mockNow);
  assert.strictEqual(result.length, 0, 'FAILED sync status must be EXCLUDED');
});

// ── Test E: Missing Timestamp ────────────────────────────────────────────────
test('Test E — Missing Timestamp (last_synced_at === NULL / undefined)', () => {
  const balances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: null
  }];

  const result = filterEligibleBalances(balances, HEALTHY_MAP, mockNow);
  assert.strictEqual(result.length, 0, 'Missing timestamp must be EXCLUDED');
});

// ── Test F: Future Timestamp ─────────────────────────────────────────────────
test('Test F — Future Timestamp (synced_at > NOW())', () => {
  const balances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(FIXED_NOW + 60000).toISOString() // 1 min in future
  }];

  const result = filterEligibleBalances(balances, HEALTHY_MAP, mockNow);
  assert.strictEqual(result.length, 0, 'Future timestamp must be EXCLUDED');
});

// ── Test G: Worker Death / Stale Balance Removal ─────────────────────────────
test('Test G — Worker Death Cascade (Stale single provider zeroes asset credit)', () => {
  const freshTime = FIXED_NOW - 10000;
  const staleTime = FIXED_NOW - (20 * 60 * 1000); // 20 min old

  const initialBalances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '50000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(freshTime).toISOString()
  }];

  // Phase 1: Worker alive -> Fresh
  const freshResult = filterEligibleBalances(initialBalances, HEALTHY_MAP, mockNow);
  assert.strictEqual(freshResult.length, 1);
  assert.strictEqual(freshResult[0].available_balance, '50000000');

  // Phase 2: Worker dead -> Stale after 20m
  const staleBalances = [{
    ...initialBalances[0],
    last_synced_at: new Date(staleTime).toISOString()
  }];
  const staleResult = filterEligibleBalances(staleBalances, HEALTHY_MAP, mockNow);
  assert.strictEqual(staleResult.length, 0, 'Stale provider assets must evaluate to 0 eligible credit');
});

// ── Test H: Unknown Provider Health / Unmapped Provider ─────────────────────
test('Test H — Unknown Provider Health / Unmapped Provider Key', () => {
  const unmappedHealthMap = {}; // Empty map
  const balances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(FIXED_NOW - 60000).toISOString()
  }];

  const result = filterEligibleBalances(balances, unmappedHealthMap, mockNow);
  assert.strictEqual(result.length, 0, 'Unmapped provider health must fail closed to OFFLINE');
});

// ── Test I: Negative or Corrupt Balance ──────────────────────────────────────
test('Test I — Negative or Corrupt Balance (NaN, Infinity, negative balance)', () => {
  const invalidBalances = [
    { provider: 'FINCRA', currency: 'NGN', available_balance: '-5000', sync_status: 'SUCCESS', last_synced_at: new Date(FIXED_NOW - 60000).toISOString() },
    { provider: 'FINCRA', currency: 'NGN', available_balance: 'abc', sync_status: 'SUCCESS', last_synced_at: new Date(FIXED_NOW - 60000).toISOString() },
    { provider: 'FINCRA', currency: 'NGN', available_balance: 'Infinity', sync_status: 'SUCCESS', last_synced_at: new Date(FIXED_NOW - 60000).toISOString() }
  ];

  const result = filterEligibleBalances(invalidBalances, HEALTHY_MAP, mockNow);
  assert.strictEqual(result.length, 0, 'Corrupt / negative balances must be EXCLUDED');
});

// ── Test J: Multiple Provider Partial Conservation ─────────────────────────
test('Test J — Multiple Provider Partial Conservation (1 stale + 1 fresh)', () => {
  const balances = [
    { provider: 'FINCRA', currency: 'NGN', available_balance: '10000000', sync_status: 'SUCCESS', last_synced_at: new Date(FIXED_NOW - (20 * 60 * 1000)).toISOString() }, // Stale
    { provider: 'NOWPAYMENTS', currency: 'USDT', available_balance: '5000', sync_status: 'SUCCESS', last_synced_at: new Date(FIXED_NOW - (5 * 60 * 1000)).toISOString() }  // Fresh (USDT TTL = 30m)
  ];

  const result = filterEligibleBalances(balances, HEALTHY_MAP, mockNow);
  assert.strictEqual(result.length, 1, 'Only the fresh provider balance must be retained');
  assert.strictEqual(result[0].provider, 'NOWPAYMENTS');
  assert.strictEqual(result[0].available_balance, '5000');
});

// ── Test K: Exactly-at-TTL Boundary Precision ──────────────────────────────
test('Test K — Exactly-at-TTL Boundary Precision (age == TTL vs age == TTL + 1ms)', () => {
  const ttlMs = 15 * 60 * 1000; // 15 mins for FINCRA NGN

  // Exactly at boundary: age == TTL
  const exactTtlBalances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(FIXED_NOW - ttlMs).toISOString()
  }];
  const exactResult = filterEligibleBalances(exactTtlBalances, HEALTHY_MAP, mockNow);
  assert.strictEqual(exactResult.length, 1, 'Exact TTL boundary (age == TTL) must be ELIGIBLE');

  // Past boundary: age == TTL + 1ms
  const pastTtlBalances = [{
    provider: 'FINCRA',
    currency: 'NGN',
    available_balance: '10000000',
    sync_status: 'SUCCESS',
    last_synced_at: new Date(FIXED_NOW - (ttlMs + 1)).toISOString()
  }];
  const pastResult = filterEligibleBalances(pastTtlBalances, HEALTHY_MAP, mockNow);
  assert.strictEqual(pastResult.length, 0, 'Exceeded TTL boundary (age == TTL + 1ms) must be EXCLUDED');
});

console.log('\n---------------------------------------------------------------------');
console.log(`  SUMMARY: Passed ${passed} / ${passed + failed} tests.`);
if (failed > 0) {
  console.log(`  FAILED TESTS (${failed}):`);
  failures.forEach(f => console.log(`    - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('  ALL GATE 1 LAYER 8 ORACLE TESTS PASSED PERFECTLY!');
  console.log('---------------------------------------------------------------------\n');
}
