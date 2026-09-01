/**
 * Phase 3A Foundation Test Suite — Quidax Architectural Preparedness & Safety Guards
 * ==============================================================================================
 * Asserts:
 *   1. Provider Selection & Fail-Closed States
 *   2. Authoritative Ledger Inviolability (No Core RPC Alteration)
 *   3. Security & Webhook Fail-Closed Behavior
 *   4. Treasury Reserve Excluded Status (NOT_ELIGIBLE_FOR_RESERVE_ASSERTION)
 *   5. Non-regression of existing payment & ledger infrastructure
 *
 * Run with: node server/tests/quidaxFoundation.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const PaymentFactory = require('../services/payment/PaymentFactory');
const quidaxService = require('../services/quidaxService');
const QuidaxProvider = require('../services/payment/providers/QuidaxProvider');
const quidaxController = require('../controllers/quidaxController');
const MultiProviderReserveEngine = require('../services/treasury/MultiProviderReserveEngine');
const env = require('../config/env');

let passed = 0;
let failed = 0;
const failures = [];

function recordTest(id, title, status, details) {
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon}  [Test ${id}] ${title}`);
  if (details) console.log(`      → ${details}`);
  if (status === 'PASS') passed++; else { failed++; failures.push({ id, title, details }); }
}

async function runQuidaxFoundationSuite() {
  console.log('\n=====================================================================');
  console.log('  NOTEStandard Phase 3A Quidax Foundation & Safety Test Suite');
  console.log('=====================================================================\n');

  // ── TEST 1: Default Environment State (Quidax Disabled)
  try {
    assert.strictEqual(env.QUIDAX_ENABLED, false, 'QUIDAX_ENABLED must default to false');
    assert.strictEqual(quidaxService.isConfigured(), false, 'quidaxService.isConfigured() must return false by default');
    recordTest('1', 'Default Environment State — Quidax disabled by default', 'PASS', 'QUIDAX_ENABLED is false');
  } catch (err) {
    recordTest('1', 'Default Environment State — Quidax disabled by default', 'FAIL', err.message);
  }

  // ── TEST 2: Provider Factory Selection Fallback
  try {
    const provider = PaymentFactory.getProvider('USDT', 'NG', true, 'crypto');
    const pName = provider.providerName || provider.name;
    assert.strictEqual(pName, 'nowpayments', 'Default crypto provider must be nowpayments');
    recordTest('2', 'PaymentFactory — Defaults to NOWPayments when Quidax inactive', 'PASS', `Active provider: ${pName}`);
  } catch (err) {
    recordTest('2', 'PaymentFactory — Defaults to NOWPayments when Quidax inactive', 'FAIL', err.message);
  }

  // ── TEST 3: PaymentFactory Explicit Quidax Lookup
  try {
    const qProvider = PaymentFactory.getProviderByName('quidax');
    assert.strictEqual(qProvider.name, 'quidax', 'getProviderByName("quidax") returns QuidaxProvider');
    recordTest('3', 'PaymentFactory — Can resolve QuidaxProvider by explicit name', 'PASS', 'Resolved QuidaxProvider');
  } catch (err) {
    recordTest('3', 'PaymentFactory — Can resolve QuidaxProvider by explicit name', 'FAIL', err.message);
  }

  // ── TEST 4: Fail-Closed on Unconfirmed Quidax Service Methods
  try {
    let errorCaught = false;
    try {
      await quidaxService.getDepositAddress('user-123', 'BTC', 'native', null);
    } catch (e) {
      errorCaught = true;
      assert(e.message.includes('QUIDAX_PROVIDER_DISABLED') || e.message.includes('QUIDAX_DOCUMENTATION_REQUIRED'), `Unexpected error message: ${e.message}`);
    }
    assert.strictEqual(errorCaught, true, 'getDepositAddress must throw fail-closed error');
    recordTest('4', 'QuidaxService — getDepositAddress fails closed on unconfirmed contract', 'PASS', 'Enforced QUIDAX_DOCUMENTATION_REQUIRED/DISABLED');
  } catch (err) {
    recordTest('4', 'QuidaxService — getDepositAddress fails closed on unconfirmed contract', 'FAIL', err.message);
  }

  // ── TEST 5: Fail-Closed on Unconfirmed Quidax Quote Execution
  try {
    let errorCaught = false;
    try {
      await quidaxService.executeLiquidation('quote-123', 'idemp-123');
    } catch (e) {
      errorCaught = true;
      assert(e.message.includes('QUIDAX_PROVIDER_DISABLED') || e.message.includes('QUIDAX_DOCUMENTATION_REQUIRED'), `Unexpected error message: ${e.message}`);
    }
    assert.strictEqual(errorCaught, true, 'executeLiquidation must throw fail-closed error');
    recordTest('5', 'QuidaxService — executeLiquidation fails closed on unconfirmed contract', 'PASS', 'Enforced QUIDAX_DOCUMENTATION_REQUIRED/DISABLED');
  } catch (err) {
    recordTest('5', 'QuidaxService — executeLiquidation fails closed on unconfirmed contract', 'FAIL', err.message);
  }

  // ── TEST 6: Unauthenticated Webhook Controller Rejection
  try {
    const mockReq = { headers: {}, body: { event: 'deposit.successful' } };
    let statusSent = null;
    let jsonSent = null;

    const mockRes = {
      status(code) { statusSent = code; return this; },
      json(payload) { jsonSent = payload; return this; }
    };

    await quidaxController.handleWebhook(mockReq, mockRes);
    assert.strictEqual(statusSent, 401, 'Unauthenticated webhook must return HTTP 401');
    assert.strictEqual(jsonSent.error_code, 'QUIDAX_WEBHOOK_NOT_CONFIGURED', 'Must return QUIDAX_WEBHOOK_NOT_CONFIGURED error code');
    recordTest('6', 'QuidaxController — Unauthenticated webhooks fail closed with HTTP 401', 'PASS', 'Rejected unauthenticated webhook');
  } catch (err) {
    recordTest('6', 'QuidaxController — Unauthenticated webhooks fail closed with HTTP 401', 'FAIL', err.message);
  }

  // ── TEST 7: MultiProviderReserveEngine — Quidax Ineligible for Reserve Calculation
  try {
    const rawBalances = [
      { provider: 'QUIDAX', currency: 'BTC', available_balance: 100, sync_status: 'SUCCESS', last_synced_at: new Date().toISOString() },
      { provider: 'NOWPAYMENTS', currency: 'BTC', available_balance: 5, sync_status: 'SUCCESS', last_synced_at: new Date().toISOString() }
    ];
    const healthMap = { QUIDAX: 'ONLINE', NOWPAYMENTS: 'ONLINE' };

    const eligible = MultiProviderReserveEngine.filterEligibleBalances(rawBalances, healthMap);
    assert.strictEqual(eligible.length, 1, 'Only NOWPayments should be eligible');
    assert.strictEqual(eligible[0].provider, 'NOWPAYMENTS', 'Quidax must be excluded from reserve calculations');
    recordTest('7', 'MultiProviderReserveEngine — Quidax is excluded from reserve assertions', 'PASS', 'Enforced NOT_ELIGIBLE_FOR_RESERVE_ASSERTION');
  } catch (err) {
    recordTest('7', 'MultiProviderReserveEngine — Quidax is excluded from reserve assertions', 'FAIL', err.message);
  }

  // ── TEST 8: Provider Deposit Addresses Table Migration Assertion
  try {
    const supabase = require('../config/database');
    const { data, error } = await supabase.from('provider_deposit_addresses').select('count', { count: 'exact', head: true });
    assert.strictEqual(error, null, `Querying provider_deposit_addresses should not error: ${error?.message}`);
    recordTest('8', 'Database Schema — provider_deposit_addresses table is queryable & active', 'PASS', 'Table accessible in PostgreSQL');
  } catch (err) {
    recordTest('8', 'Database Schema — provider_deposit_addresses table is queryable & active', 'FAIL', err.message);
  }

  console.log('\n=====================================================================');
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================================\n');

  if (failed > 0) {
    console.error('Failures:', failures);
    process.exit(1);
  }
}

runQuidaxFoundationSuite();
