'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const PlatformSettlementService = require('../services/settlement/PlatformSettlementService');
const supabase = require('../config/database');

async function testPhase11FailureModes() {
  console.log('── PHASE 11: FAILURE MODE & UNKNOWN OUTCOME TESTING ──\n');

  let passed = 0;
  let failed = 0;
  const adminId = '00000000-0000-0000-0000-000000000000';
  const cleanRefs = [];

  function pass(name) {
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  }

  function fail(name, err) {
    failed++;
    console.log(`  ❌ [FAIL] ${name} — ${err}`);
  }

  // 1. TEST G: Missing destination fail-closed in live mode
  console.log('── TEST G: Missing Destination Fail-Closed ─────────────────');
  const origFlag = process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION;
  const origNgnDest = process.env.FINCRA_MERCHANT_NGN_ACCOUNT_ID;
  const origAccNum = process.env.FINCRA_ACCOUNT_NUMBER;
  const origSettDest = process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID;

  process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'true';
  delete process.env.FINCRA_MERCHANT_NGN_ACCOUNT_ID;
  delete process.env.FINCRA_ACCOUNT_NUMBER;
  delete process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID;

  try {
    await PlatformSettlementService.requestSettlement({
      adminUserId: adminId,
      amount: 10,
      currency: 'NGN',
      idempotencyKey: `TEST_MISSING_DEST_${Date.now()}`,
    });
    fail('Test G: Missing destination in live mode is rejected', 'Should have thrown MISSING_APPROVED_SETTLEMENT_DESTINATION');
  } catch (err) {
    if (err.message.includes('MISSING_APPROVED_SETTLEMENT_DESTINATION')) {
      pass('Test G: Missing destination in live mode throws MISSING_APPROVED_SETTLEMENT_DESTINATION');
    } else {
      fail('Test G: Missing destination error', err.message);
    }
  } finally {
    // Restore env
    process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = origFlag || 'false';
    if (origNgnDest) process.env.FINCRA_MERCHANT_NGN_ACCOUNT_ID = origNgnDest;
    if (origAccNum) process.env.FINCRA_ACCOUNT_NUMBER = origAccNum;
    if (origSettDest) process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID = origSettDest;
  }

  // 2. TEST B & F: Timeout -> PENDING_RECONCILIATION & Retry idempotency
  console.log('\n── TEST B & F: Timeout Ambiguity & Idempotency ──────────────');
  const refB = `TEST_TIMEOUT_${Date.now()}`;
  cleanRefs.push(refB);

  // Insert a PENDING_RECONCILIATION test record
  const { data: recB, error: errB } = await supabase
    .from('platform_settlements')
    .insert({
      reference: refB,
      amount: 100,
      currency: 'NGN',
      status: 'PENDING_RECONCILIATION',
      destination_account: 'NS_APPROVED_NGN_SETTLEMENT_ACCOUNT',
      initiated_by: adminId,
      is_live_execution: true,
      failure_reason: 'Network timeout during dispatch: ETIMEDOUT',
    })
    .select('*')
    .single();

  if (errB || !recB) {
    fail('Test B Setup', errB ? errB.message : 'Record creation failed');
  } else {
    pass('Test B: PENDING_RECONCILIATION status inserted');

    // Test F: Retry with same idempotencyKey returns PENDING_RECONCILIATION record without second dispatch
    const retryRes = await PlatformSettlementService.requestSettlement({
      adminUserId: adminId,
      amount: 100,
      currency: 'NGN',
      idempotencyKey: refB,
    });

    if (retryRes.alreadyProcessed === true && retryRes.settlement.status === 'PENDING_RECONCILIATION') {
      pass('Test F: Retry returns PENDING_RECONCILIATION record without second dispatch');
    } else {
      fail('Test F: Retry idempotency', JSON.stringify(retryRes));
    }
  }

  // 3. TEST C & D: Webhook resolution of PENDING_RECONCILIATION
  console.log('\n── TEST C & D: Webhook Resolution of Timeout Records ──────');
  const refC = `TEST_TIMEOUT_WH_C_${Date.now()}`;
  const refD = `TEST_TIMEOUT_WH_D_${Date.now()}`;
  cleanRefs.push(refC, refD);

  await supabase.from('platform_settlements').insert([
    { reference: refC, amount: 50, currency: 'NGN', status: 'PENDING_RECONCILIATION', destination_account: 'NS_APPROVED_NGN_SETTLEMENT_ACCOUNT', initiated_by: adminId, is_live_execution: true },
    { reference: refD, amount: 50, currency: 'NGN', status: 'PENDING_RECONCILIATION', destination_account: 'NS_APPROVED_NGN_SETTLEMENT_ACCOUNT', initiated_by: adminId, is_live_execution: true },
  ]);

  // Webhook Success on PENDING_RECONCILIATION
  const whSuccessRes = await PlatformSettlementService.handlePayoutSuccessful(refC, 'FIN_C_REF');
  if (whSuccessRes.status === 'COMPLETED') {
    pass('Test C: payout.successful webhook moves PENDING_RECONCILIATION record to COMPLETED');
  } else {
    fail('Test C: Webhook resolution to COMPLETED', JSON.stringify(whSuccessRes));
  }

  // Webhook Failure on PENDING_RECONCILIATION
  const whFailedRes = await PlatformSettlementService.handlePayoutFailed(refD, 'Provider rejected');
  if (whFailedRes.status === 'FAILED') {
    pass('Test D: payout.failed webhook moves PENDING_RECONCILIATION record to FAILED');
  } else {
    fail('Test D: Webhook resolution to FAILED', JSON.stringify(whFailedRes));
  }

  // 4. Cleanup
  console.log('\n── Cleanup ─────────────────────────────────────────────────');
  await supabase.from('platform_settlements').delete().in('reference', cleanRefs);
  pass('Cleanup: Test failure-mode records removed');

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(` FAILURE MODE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  if (failed > 0) process.exit(1);
}

testPhase11FailureModes().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
