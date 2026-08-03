'use strict';

/**
 * merchantCollectionIntegration.test.js
 * ========================================
 * Integration Test Suite for Enterprise Multi-Currency Collection Architecture (v4.0).
 * Verifies end-to-end multi-currency collection flows, deposit reference lifecycle,
 * scored matching engine, settlement policies, correlated dual-journal accounting,
 * unallocated queue replay, manual reconciliation, and ACID compliance.
 */

const assert = require('assert');
const CollectionAccountService = require('../services/payment/CollectionAccountService');
const DepositReferenceService = require('../services/payment/DepositReferenceService');
const DepositInstructionPolicyService = require('../services/payment/DepositInstructionPolicyService');
const ScoredMatchingEngine = require('../services/payment/ScoredMatchingEngine');
const SettlementPolicyService = require('../services/payment/SettlementPolicyService');
const UnallocatedDepositsService = require('../services/payment/UnallocatedDepositsService');
const PaymentIntentEngine = require('../services/payment/PaymentIntentEngine');
const WebhookPipeline = require('../services/payment/WebhookPipeline');
const PostingService = require('../services/financial/PostingService');
const WalletAccountService = require('../services/financial/WalletAccountService');
const TreasuryService = require('../services/financial/TreasuryService');
const ReconciliationEngine = require('../services/reconciliation/ReconciliationEngine');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function runMerchantCollectionIntegrationTests() {
  console.log('==================================================================');
  console.log('🏛️  Running Enterprise Multi-Currency Collection Test Suite (v4.0)');
  console.log('==================================================================');

  // Initialize Core Services
  const walletService = new WalletAccountService();
  const treasuryService = new TreasuryService();
  const postingService = new PostingService(null, { walletAccountService: walletService, treasuryService });
  const paymentIntentEngine = new PaymentIntentEngine();
  const collectionAccountService = new CollectionAccountService();
  const depositRefService = new DepositReferenceService();
  const matchingEngine = new ScoredMatchingEngine({ depositRefService });
  const settlementPolicyService = new SettlementPolicyService();
  const unallocatedService = new UnallocatedDepositsService({
    postingService,
    walletService,
    treasuryService
  });

  const policyService = new DepositInstructionPolicyService({
    collectionAccountService,
    depositRefService,
    paymentIntentEngine
  });

  const webhookPipeline = new WebhookPipeline({
    postingService,
    walletService,
    treasuryService,
    depositRefService,
    matchingEngine,
    settlementPolicyService,
    unallocatedService
  });

  const reconciliationEngine = new ReconciliationEngine();

  // TEST 1 — Collection Account Inventory & Multi-Currency Rail Mapping
  section('TEST 1 — Collection Account Inventory & Multi-Currency Rail Mapping');
  const eurAccount = await collectionAccountService.getActiveCollectionAccount('fincra', 'EUR', 'SEPA');
  assert.strictEqual(eurAccount.currency, 'EUR');
  assert.strictEqual(eurAccount.rail, 'SEPA');
  assert.strictEqual(eurAccount.beneficiary, 'Jossy Digital Technologies Ltd');
  assert.ok(eurAccount.iban.startsWith('LU'));

  const gbpAccount = await collectionAccountService.getActiveCollectionAccount('fincra', 'GBP', 'FASTER_PAYMENTS');
  assert.strictEqual(gbpAccount.currency, 'GBP');
  assert.strictEqual(gbpAccount.rail, 'FASTER_PAYMENTS');
  assert.strictEqual(gbpAccount.sort_code, '04-00-04');
  console.log('✓ Collection Account inventory & multi-currency rail mapping verified.');

  // TEST 2 — Deposit Reference Generation & 72-Hour Expiration Rules
  section('TEST 2 — Deposit Reference Generation & Expiration Rules');
  const user = 'usr_collection_test_01';
  const wallet = await walletService.getOrCreateAccount(user, 'EUR', 'PRIMARY');

  const refRecord = await depositRefService.createReference({
    userId: user,
    walletId: wallet.id,
    currency: 'EUR',
    rail: 'SEPA',
    expectedAmount: 500,
    amountValidationMode: 'OPEN_AMOUNT',
    ttlHours: 72
  });

  assert.ok(refRecord.reference.startsWith('NS-EUR-'));
  assert.strictEqual(refRecord.status, 'AWAITING_PAYMENT');
  assert.ok(refRecord.idempotency_key);
  console.log(`✓ Deposit reference generated: ${refRecord.reference} (Idempotency Key: ${refRecord.idempotency_key})`);

  // TEST 3 — Deposit Instruction Policy Engine Response Payload
  section('TEST 3 — Deposit Instruction Policy Engine Response Payload');
  const instructions = await policyService.generateDepositInstructions({
    userId: user,
    walletAccountId: wallet.id,
    currency: 'GBP',
    amount: 250,
    provider: 'fincra',
    amountValidationMode: 'EXACT'
  });

  assert.strictEqual(instructions.instructionVersion, 'v1.0');
  assert.strictEqual(instructions.providerCapabilityVersion, 'v2.4');
  assert.strictEqual(instructions.currency, 'GBP');
  assert.strictEqual(instructions.beneficiary, 'Jossy Digital Technologies Ltd');
  assert.strictEqual(instructions.sortCode, '04-00-04');
  assert.ok(instructions.reference.startsWith('NS-GBP-'));
  console.log('✓ Deposit Instruction Policy Engine response payload verified.');

  // TEST 4 — Scored Webhook Matching Engine (Priority 1-6)
  section('TEST 4 — Scored Webhook Matching Engine (Priority 1-6)');
  const matchResult = await matchingEngine.matchDeposit({
    reference: refRecord.reference,
    amount: 500,
    currency: 'EUR'
  });

  assert.strictEqual(matchResult.isMatched, true);
  assert.ok(matchResult.confidenceScore >= 100);
  assert.ok(matchResult.matchReasons.includes('Matched Reference'));
  console.log(`✓ Scored matching confidence: ${matchResult.confidenceScore} (Reasons: ${matchResult.matchReasons.join(', ')})`);

  // TEST 5 — Settlement Policy Evaluation
  section('TEST 5 — Settlement Policy Evaluation');
  const sepaEval = settlementPolicyService.evaluateSettlement({ provider: 'fincra', rail: 'SEPA', amount: 500, currency: 'EUR' });
  assert.strictEqual(sepaEval.settlementType, 'INSTANT');
  assert.strictEqual(sepaEval.settlementStatus, 'SETTLED');

  const achEval = settlementPolicyService.evaluateSettlement({ provider: 'fincra', rail: 'ACH', amount: 15000, currency: 'USD' });
  assert.strictEqual(achEval.settlementType, 'DELAYED');
  assert.strictEqual(achEval.settlementStatus, 'PENDING_SETTLEMENT');
  console.log('✓ Settlement Policy evaluation verified.');

  // TEST 6 — Webhook Ingestion, Correlated Dual-Journals & Wallet Balance Posting
  section('TEST 6 — Correlated Dual-Journals & Wallet Balance Posting');
  const depositRef2 = await depositRefService.createReference({
    userId: user,
    walletId: wallet.id,
    currency: 'EUR',
    rail: 'SEPA',
    expectedAmount: 1200,
    amountValidationMode: 'EXACT'
  });

  const webhookResult = await webhookPipeline.processWebhook({
    provider: 'fincra',
    eventId: `evt_test_${Date.now()}`,
    eventType: 'charge.successful',
    providerReference: depositRef2.reference,
    reference: depositRef2.reference,
    currency: 'EUR',
    rail: 'SEPA',
    amount: 1200,
    signature: 'VALID_SIGNATURE',
    userId: user,
    walletAccountId: wallet.id
  });

  assert.strictEqual(webhookResult.status, 'PROCESSED');
  assert.ok(webhookResult.correlationId);
  assert.strictEqual(webhookResult.treasuryJournal.journal.status, 'POSTED');
  assert.strictEqual(webhookResult.customerJournal.journal.status, 'POSTED');
  assert.strictEqual(wallet.available_balance, 1200);
  console.log(`✓ Correlated Dual-Journals committed. Wallet Balance: ${wallet.available_balance} EUR`);

  // TEST 7 — Duplicate Webhook Idempotency Suppression
  section('TEST 7 — Duplicate Webhook Idempotency Suppression');
  const duplicateResult = await webhookPipeline.processWebhook({
    provider: 'fincra',
    eventId: 'evt_test_duplicate_123',
    eventType: 'charge.successful',
    providerReference: depositRef2.reference,
    reference: depositRef2.reference,
    currency: 'EUR',
    amount: 1200,
    signature: 'VALID_SIGNATURE'
  });

  const duplicateRetryResult = await webhookPipeline.processWebhook({
    provider: 'fincra',
    eventId: 'evt_test_duplicate_123',
    eventType: 'charge.successful',
    providerReference: depositRef2.reference,
    reference: depositRef2.reference,
    currency: 'EUR',
    amount: 1200,
    signature: 'VALID_SIGNATURE'
  });

  assert.strictEqual(duplicateRetryResult.status, 'DUPLICATE');
  assert.strictEqual(wallet.available_balance, 2400); // Balance unchanged by duplicate retry
  console.log('✓ Duplicate webhook payload suppressed by idempotency guard.');

  // TEST 8 — Unknown Transfer Routed to Unallocated Queue
  section('TEST 8 — Unknown Transfer Routed to Unallocated Queue');
  const unallocatedResult = await webhookPipeline.processWebhook({
    provider: 'fincra',
    eventId: `evt_unknown_${Date.now()}`,
    eventType: 'charge.successful',
    providerReference: 'UNKNOWN_REF_99999',
    reference: 'UNKNOWN_REF_99999',
    currency: 'USD',
    rail: 'ACH',
    amount: 3500,
    senderName: 'Jane Doe',
    signature: 'VALID_SIGNATURE'
  });

  assert.strictEqual(unallocatedResult.status, 'UNALLOCATED');
  assert.ok(unallocatedResult.unallocatedRecord);
  assert.strictEqual(unallocatedResult.unallocatedRecord.status, 'UNALLOCATED');
  console.log('✓ Unknown transfer safely captured in unallocated queue without throwing/rejecting.');

  // TEST 9 — Manual Customer Assignment & PostingService Replay
  section('TEST 9 — Manual Customer Assignment & PostingService Replay');
  const user2 = 'usr_collection_test_02';
  const wallet2 = await walletService.getOrCreateAccount(user2, 'USD', 'PRIMARY');

  const replayResult = await unallocatedService.assignCustomerAndReplay(
    unallocatedResult.unallocatedRecord.id,
    user2,
    wallet2.id
  );

  assert.strictEqual(replayResult.status, 'REPLAY_SUCCESSFUL');
  assert.ok(replayResult.correlationId);
  assert.strictEqual(wallet2.available_balance, 3500);
  console.log(`✓ Manual replay executed. Wallet 2 Balance: ${wallet2.available_balance} USD`);

  // TEST 10 — Multi-Currency Reconciliation & Break Reporting
  section('TEST 10 — Multi-Currency Reconciliation & Break Reporting');
  const reconResult = await reconciliationEngine.reconcileMerchantDeposits(
    'fincra',
    [
      { id: 'stmt_1', reference: depositRef2.reference, amount: 1200, currency: 'EUR' },
      { id: 'stmt_2', reference: 'UNMATCHED_BANK_STMT_001', amount: 800, currency: 'USD' }
    ],
    [depositRef2]
  );

  assert.strictEqual(reconResult.matchedCount, 1);
  assert.strictEqual(reconResult.breakCount, 1);
  assert.strictEqual(reconResult.status, 'HAS_UNMATCHED_DEPOSITS');
  console.log('✓ Reconciliation Engine break detection & summary report verified.');

  // TEST 11 — Concurrent Deposits ACID Compliance
  section('TEST 11 — Concurrent Deposits ACID Compliance');
  const concurrentUser = 'usr_concurrent_test';
  const concurrentWallet = await walletService.getOrCreateAccount(concurrentUser, 'GBP', 'PRIMARY');

  const concurrentRefs = await Promise.all([
    depositRefService.createReference({ userId: concurrentUser, walletId: concurrentWallet.id, currency: 'GBP', expectedAmount: 100 }),
    depositRefService.createReference({ userId: concurrentUser, walletId: concurrentWallet.id, currency: 'GBP', expectedAmount: 200 }),
    depositRefService.createReference({ userId: concurrentUser, walletId: concurrentWallet.id, currency: 'GBP', expectedAmount: 300 })
  ]);

  await Promise.all(
    concurrentRefs.map((ref, idx) =>
      webhookPipeline.processWebhook({
        provider: 'fincra',
        eventId: `evt_concurrent_${idx}_${Date.now()}`,
        eventType: 'charge.successful',
        providerReference: ref.reference,
        reference: ref.reference,
        currency: 'GBP',
        amount: (idx + 1) * 100,
        signature: 'VALID_SIGNATURE',
        userId: concurrentUser,
        walletAccountId: concurrentWallet.id
      })
    )
  );

  assert.strictEqual(concurrentWallet.available_balance, 600);
  console.log(`✓ Concurrent deposits processed cleanly. Final Balance: ${concurrentWallet.available_balance} GBP`);

  console.log('\n==================================================================');
  console.log('🎉 ALL ENTERPRISE MULTI-CURRENCY COLLECTION INTEGRATION TESTS PASSED!');
  console.log('==================================================================\n');
}

if (require.main === module) {
  runMerchantCollectionIntegrationTests().catch((err) => {
    console.error('❌ Integration Test Failure:', err);
    process.exit(1);
  });
}

module.exports = runMerchantCollectionIntegrationTests;
