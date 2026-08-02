'use strict';

/**
 * multiProviderExpansionIntegration.test.js
 * ==========================================
 * Step 6 Multi-Provider Expansion & Adapter Suite Integration Test Suite.
 */

const assert = require('assert');
const AnchorAdapter = require('../services/providers/AnchorAdapter');
const ConduitAdapter = require('../services/providers/ConduitAdapter');
const WebhookNormalizationService = require('../services/providers/WebhookNormalizationService');
const ProviderFailoverService = require('../services/providers/ProviderFailoverService');
const IBankProvider = require('../services/payment/IBankProvider');
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
  console.log('🚀 Running Step 6 Multi-Provider Expansion Test Suite (v1.0)');
  console.log('==================================================================');

  const anchor = new AnchorAdapter();
  const conduit = new ConduitAdapter();
  const normalizationService = new WebhookNormalizationService();
  const failoverService = new ProviderFailoverService();
  const walletService = new WalletAccountService();
  const treasuryService = new TreasuryService();
  const postingService = new PostingService(null, { walletAccountService: walletService, treasuryService });

  // TEST 1 — Adapter Contract Compliance
  section('TEST 1 — Adapter Contract Compliance (IBankProvider)');
  assert.ok(anchor instanceof IBankProvider, 'AnchorAdapter implements IBankProvider');
  assert.ok(conduit instanceof IBankProvider, 'ConduitAdapter implements IBankProvider');
  console.log('✓ Anchor and Conduit adapters strictly implement IBankProvider contract.');

  // TEST 2 — Dynamic Capability Discovery
  section('TEST 2 — Dynamic Capability Discovery');
  const anchorCaps = await anchor.getCapabilities();
  const conduitCaps = await conduit.getCapabilities();

  assert.deepStrictEqual(anchorCaps.supportedCurrencies, ['NGN', 'USD', 'EUR', 'GBP']);
  assert.deepStrictEqual(conduitCaps.supportedCurrencies, ['USD', 'EUR']);
  assert.ok(conduitCaps.supportedRails.includes('ACH'));
  console.log('✓ Dynamic capabilities advertised accurately per provider.');

  // TEST 3 — Webhook Payload Normalization
  section('TEST 3 — Webhook Payload Normalization');
  const fincraNorm = normalizationService.normalizeWebhook('fincra', { event: 'charge.successful', reference: 'FIN_123', amount: 50000 });
  const anchorNorm = normalizationService.normalizeWebhook('anchor', { event: 'payment.settled', reference: 'ANC_456', amount: 100 });
  const conduitNorm = normalizationService.normalizeWebhook('conduit', { type: 'transaction.completed', transaction_id: 'CND_789', amount: 200 });

  assert.strictEqual(fincraNorm.normalizedEventType, 'DepositSucceeded');
  assert.strictEqual(anchorNorm.normalizedEventType, 'DepositSucceeded');
  assert.strictEqual(conduitNorm.normalizedEventType, 'DepositSucceeded');
  console.log('✓ Provider webhooks normalized into unified domain events.');

  // TEST 4 — Failover Policy Evaluation
  section('TEST 4 — Failover Policy Evaluation');
  const infraResult = await failoverService.evaluateFailover(new Error('SERVICE_UNAVAILABLE_503'));
  assert.strictEqual(infraResult.allowFailover, true);
  assert.strictEqual(infraResult.classification, 'RETRYABLE_INFRASTRUCTURE');

  const bizResult = await failoverService.evaluateFailover(new Error('INSUFFICIENT_FUNDS'));
  assert.strictEqual(bizResult.allowFailover, false);
  assert.strictEqual(bizResult.classification, 'BUSINESS_VALIDATION');
  console.log('✓ Failover policy allowed 503 retryable infrastructure errors and blocked business validation errors.');

  // TEST 5 — Multi-Provider Deposit Execution & Step 2 Ledger Posting
  section('TEST 5 — Multi-Provider Deposit Execution & Double-Entry Accounting');
  const userA = 'usr_anchor_5001';
  const walletA = await walletService.getOrCreateAccount(userA, 'USD', 'PRIMARY');
  const treasuryA = await treasuryService.getOrCreateAccount('USD', 'AVAILABLE');

  // Execute Deposit via Anchor Adapter
  const anchorDeposit = await anchor.deposit({ currency: 'USD', amount: 500, user: userA });
  assert.strictEqual(anchorDeposit.success, true);
  assert.strictEqual(anchorDeposit.provider, 'anchor');

  // Process normalized webhook through shared Step 2 PostingService
  const postingResult = await postingService.postJournal({
    reference: `JNL_${anchorDeposit.providerReference}`,
    entryType: 'DEPOSIT',
    description: `USD Deposit via Anchor (${anchorDeposit.providerReference})`,
    walletAccountId: walletA.id,
    treasuryAccountId: treasuryA.id,
    lines: [
      { chartAccountId: '1120', debit: 500, credit: 0, currency: 'USD' },
      { chartAccountId: '2120', debit: 0, credit: 500, currency: 'USD' }
    ]
  });

  assert.strictEqual(postingResult.journal.status, 'POSTED');
  assert.strictEqual(walletA.available_balance, 500, 'USD Wallet credited 500 via Anchor');
  console.log('✓ Multi-provider deposit processed through common accounting pipeline.');

  console.log('\n==================================================================');
  console.log('🎉 ALL STEP 6 MULTI-PROVIDER INTEGRATION TESTS PASSED!');
  console.log('==================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
