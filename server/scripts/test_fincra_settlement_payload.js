'use strict';

/**
 * test_fincra_settlement_payload.js
 * ══════════════════════════════════════════════════════════════════════════════
 * Unit and Integration Test Suite for Fincra Settlement Payout Payload
 * Verification of minimal repair: businessId, paymentDestination, and fail-closed validation.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✅ PASS: ${name}`);
  passed++;
}

function fail(name, reason) {
  console.error(`  ❌ FAIL: ${name}\n         Reason: ${reason}`);
  failed++;
}

async function runPayloadTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' FINCRA SETTLEMENT PAYLOAD MINIMAL REPAIR TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const origLiveFlag = process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION;
  const origBusinessId = process.env.FINCRA_BUSINESS_ID;

  try {
    // ── TEST A & B: Payload Structure in Live Execution Mode ────────
    console.log('── Test A & B: Payload Structure in Live Execution Mode ────────');
    process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'true';
    process.env.FINCRA_BUSINESS_ID = '6a4ff170021f8ec0b94ebb65';

    let capturedPayload = null;
    let requestCount = 0;

    const clientPath = require.resolve('../services/fincra/client');
    const providerPath = require.resolve('../services/settlement/FincraSettlementProvider');

    // Clear module cache
    delete require.cache[clientPath];
    delete require.cache[providerPath];

    // Mock client module
    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: {
        getFincraClient: () => ({
          instance: {
            post: async (endpoint, payload) => {
              requestCount++;
              capturedPayload = payload;
              return {
                status: 200,
                data: {
                  success: true,
                  data: {
                    reference: 'FINCRA_MOCK_REF_9999',
                    status: 'processing'
                  }
                }
              };
            }
          },
          businessId: process.env.FINCRA_BUSINESS_ID
        }),
        assertFincraEnabled: () => true
      }
    };

    const FincraSettlementProvider = require('../services/settlement/FincraSettlementProvider');

    const res = await FincraSettlementProvider.createPayout({
      address: '5000701121',
      amount: 1000,
      currency: 'NGN',
      reference: 'TEST_PAYLOAD_REF_001'
    });

    if (requestCount === 1) {
      pass('Live payout delegated to Fincra endpoint exactly once');
    } else {
      fail('Live payout delegation count', `Expected 1 request, got ${requestCount}`);
    }

    if (capturedPayload && capturedPayload.business === '6a4ff170021f8ec0b94ebb65') {
      pass('Test A: payload.business matches configured businessId');
    } else {
      fail('Test A: payload.business', `Expected '6a4ff170021f8ec0b94ebb65', got '${capturedPayload?.business}'`);
    }

    if (capturedPayload && capturedPayload.paymentDestination === 'bank_account') {
      pass('Test B: payload.paymentDestination is "bank_account"');
    } else {
      fail('Test B: payload.paymentDestination', `Expected 'bank_account', got '${capturedPayload?.paymentDestination}'`);
    }

    // Print sanitized payload for verification report
    const sanitized = JSON.parse(JSON.stringify(capturedPayload));
    sanitized.business = '<REDACTED_BUSINESS_ID>';
    console.log('\n  [SANITIZED GENERATED PAYLOAD]:\n', JSON.stringify(sanitized, null, 2), '\n');

    // ── TEST C: Missing Business ID fails closed ──────────────────────────
    console.log('── Test C: Missing Business ID Fail-Closed Protection ──────────');
    process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'true';
    process.env.FINCRA_BUSINESS_ID = '';

    delete require.cache[clientPath];
    delete require.cache[providerPath];

    let failClosedReqCount = 0;
    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: {
        getFincraClient: () => ({
          instance: {
            post: async () => {
              failClosedReqCount++;
              return { status: 200, data: {} };
            }
          },
          businessId: ''
        }),
        assertFincraEnabled: () => true
      }
    };

    const FincraSettlementProviderFailClosed = require('../services/settlement/FincraSettlementProvider');

    let threw = false;
    try {
      await FincraSettlementProviderFailClosed.createPayout({
        address: '5000701121',
        amount: 1000,
        currency: 'NGN',
        reference: 'TEST_FAIL_CLOSED_REF_002'
      });
    } catch (err) {
      threw = true;
      if (err.message.includes('FINCRA business ID is not configured')) {
        pass('Test C: Throws explicit error when businessId is missing');
      } else {
        fail('Test C: Error message', `Unexpected error message: ${err.message}`);
      }
    }

    if (!threw) {
      fail('Test C: Fail-closed', 'createPayout did not throw when businessId was empty');
    }

    if (failClosedReqCount === 0) {
      pass('Test C: Fincra HTTP request count = 0 when businessId is missing');
    } else {
      fail('Test C: HTTP request count', `Expected 0 requests, got ${failClosedReqCount}`);
    }

    // Clean cache restore
    delete require.cache[clientPath];
    delete require.cache[providerPath];

  } finally {
    process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = origLiveFlag || 'false';
    process.env.FINCRA_BUSINESS_ID = origBusinessId || '';
  }

  console.log(`\nPayload Test Results: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) process.exit(1);
}

runPayloadTests();
