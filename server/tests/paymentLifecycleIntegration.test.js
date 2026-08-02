'use strict';

/**
 * paymentLifecycleIntegration.test.js
 * ====================================
 * Step 3 Payments Layer & Webhook Pipeline Integration Test Suite.
 */

const assert = require('assert');
const PaymentIntentEngine = require('../services/payment/PaymentIntentEngine');
const PaymentSessionService = require('../services/payment/PaymentSessionService');
const TransactionLifecycleService = require('../services/payment/TransactionLifecycleService');
const PaymentExecutionCoordinator = require('../services/payment/PaymentExecutionCoordinator');
const WebhookPipeline = require('../services/payment/WebhookPipeline');
const OutboxPublisher = require('../services/payment/OutboxPublisher');
const PostingService = require('../services/financial/PostingService');
const WalletAccountService = require('../services/financial/WalletAccountService');
const TreasuryService = require('../services/financial/TreasuryService');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function runTests() {
  console.log('==================================================================');
  console.log('🚀 Running Step 3 Payments Layer Integration Test Suite (v1.0)');
  console.log('==================================================================');

  const intentEngine = new PaymentIntentEngine();
  const sessionService = new PaymentSessionService();
  const txLifecycle = new TransactionLifecycleService();
  const walletService = new WalletAccountService();
  const treasuryService = new TreasuryService();
  const postingService = new PostingService(null, { walletAccountService: walletService, treasuryService });
  const outboxPublisher = new OutboxPublisher();

  const coordinator = new PaymentExecutionCoordinator({
    intentEngine,
    sessionService,
    txLifecycle
  });

  const webhookPipeline = new WebhookPipeline({
    txLifecycle,
    postingService,
    outboxPublisher
  });

  // TEST 1 — Initiate Deposit Checkout via Coordinator
  section('TEST 1 — Initiate Deposit Checkout via PaymentExecutionCoordinator');
  const userId = 'usr_pay_test_2002';
  const walletAccount = await walletService.getOrCreateAccount(userId, 'NGN', 'PRIMARY');
  const treasuryAccount = await treasuryService.getOrCreateAccount('NGN', 'AVAILABLE');

  const initResult = await coordinator.initiateDeposit({
    userId,
    walletAccountId: walletAccount.id,
    currency: 'NGN',
    amount: 75000,
    traceId: 'trace_test_001',
    correlationId: 'corr_test_001'
  });

  assert.strictEqual(initResult.intent.status, 'ACTIVE');
  assert.strictEqual(initResult.session.session_version, 1);
  assert.strictEqual(initResult.transaction.status, 'CREATED');
  assert.ok(initResult.checkoutUrl.includes('fincra.com'), 'Checkout URL generated');
  console.log('✓ Deposit checkout flow initiated successfully.');

  // TEST 2 — Session Versioning (Append-Only v1 -> v2)
  section('TEST 2 — Session Versioning (Append-Only v1 -> v2 Rotation)');
  const sessionV2 = await sessionService.createSession({
    intentId: initResult.intent.id,
    provider: 'fincra',
    checkoutUrl: `https://checkout.fincra.com/pay/REF_V2`,
    providerReference: 'REF_V2'
  });
  assert.strictEqual(sessionV2.session_version, 2, 'Session version incremented to 2');
  console.log('✓ Session versioning rotation (v2) verified.');

  // TEST 3 — Illegal State Transition Rejection
  section('TEST 3 — Illegal State Transition Rejection');
  let transitionError = false;
  try {
    await txLifecycle.transitionState(initResult.transaction.id, 'SETTLED', {
      currentStatus: 'CREATED'
    });
  } catch (err) {
    transitionError = true;
    assert.ok(err.message.includes('ILLEGAL_STATE_TRANSITION'), 'Must reject CREATED -> SETTLED');
  }
  assert.ok(transitionError, 'Illegal state transition rejected');
  console.log('✓ Illegal transition rejected correctly.');

  // TEST 4 — Webhook HMAC Quarantining
  section('TEST 4 — Webhook HMAC Signature Quarantining');
  const quarantineResult = await webhookPipeline.processWebhook({
    provider: 'fincra',
    signature: 'INVALID_SIGNATURE',
    providerReference: initResult.session.provider_reference,
    currency: 'NGN',
    amount: 75000
  });
  assert.strictEqual(quarantineResult.status, 'QUARANTINED');
  assert.strictEqual(quarantineResult.quarantineReason, 'INVALID_SIGNATURE');
  console.log('✓ Invalid signature payload quarantined successfully.');

  // TEST 5 — Webhook Processing & Ledger Posting Delegation (SUCCEEDED -> POSTED)
  section('TEST 5 — Webhook Processing & Posting Delegation (SUCCEEDED -> POSTED)');
  const webhookResult = await webhookPipeline.processWebhook({
    provider: 'fincra',
    eventId: 'evt_fincra_1001',
    eventType: 'charge.successful',
    providerReference: initResult.session.provider_reference,
    currency: 'NGN',
    amount: 75000,
    signature: 'VALID_HMAC_SIGNATURE',
    walletAccountId: walletAccount.id,
    treasuryAccountId: treasuryAccount.id,
    transactionId: initResult.transaction.id
  });

  assert.strictEqual(webhookResult.status, 'PROCESSED');
  assert.strictEqual(webhookResult.postingResult.journal.status, 'POSTED');
  assert.strictEqual(walletAccount.available_balance, 75000, 'Wallet balance credited via Step 2 PostingService');
  assert.strictEqual(treasuryAccount.balance, 75000, 'Treasury balance updated via Step 2 PostingService');
  console.log('✓ Webhook processing & PostingService accounting completed successfully.');

  // TEST 6 — Webhook SHA256 Idempotency Lock Test (10 Duplicate Retries)
  section('TEST 6 — Webhook SHA256 Idempotency Lock Test (10 Retries)');
  for (let i = 0; i < 10; i++) {
    const dupeResult = await webhookPipeline.processWebhook({
      provider: 'fincra',
      eventId: 'evt_fincra_1001',
      eventType: 'charge.successful',
      providerReference: initResult.session.provider_reference,
      currency: 'NGN',
      amount: 75000,
      signature: 'VALID_HMAC_SIGNATURE',
      walletAccountId: walletAccount.id,
      treasuryAccountId: treasuryAccount.id,
      transactionId: initResult.transaction.id
    });
    assert.strictEqual(dupeResult.status, 'DUPLICATE');
  }

  assert.strictEqual(walletAccount.available_balance, 75000, 'Wallet balance remains exactly 75,000 despite 10 duplicate webhooks');
  console.log('✓ SHA256 Idempotency lock prevented duplicate crediting across 10 retried webhooks.');

  // TEST 7 — Transactional Outbox Event Publication
  section('TEST 7 — Transactional Outbox Event Publication');
  const publishedEvents = await outboxPublisher.publishPendingEvents();
  assert.strictEqual(publishedEvents.length, 1);
  assert.strictEqual(publishedEvents[0].eventType, 'DepositSucceeded');
  assert.strictEqual(publishedEvents[0].status, 'PUBLISHED');
  console.log('✓ Transactional outbox published DepositSucceeded event successfully.');

  console.log('\n==================================================================');
  console.log('🎉 ALL STEP 3 PAYMENTS LAYER INTEGRATION TESTS PASSED!');
  console.log('==================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
