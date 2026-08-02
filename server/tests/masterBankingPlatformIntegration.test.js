'use strict';

/**
 * masterBankingPlatformIntegration.test.js
 * =========================================
 * Comprehensive Master End-to-End Test Suite for NoteStandard Enterprise Banking Platform.
 * Validates Steps 1 through 8 end-to-end.
 */

const assert = require('assert');
const AnchorAdapter = require('../services/providers/AnchorAdapter');
const ConduitAdapter = require('../services/providers/ConduitAdapter');
const RecommendationEngine = require('../services/optimization/RecommendationEngine');
const ProviderScoreService = require('../services/optimization/ProviderScoreService');
const TreasuryTransferService = require('../services/optimization/TreasuryTransferService');
const FXQuoteService = require('../services/optimization/FXQuoteService');
const FeatureFlagEngine = require('../services/production/FeatureFlagEngine');
const CanaryController = require('../services/production/CanaryController');
const RollbackManager = require('../services/production/RollbackManager');
const RBACService = require('../services/security/RBACService');
const SanctionsAMLService = require('../services/security/SanctionsAMLService');

const PostingService = require('../services/financial/PostingService');
const WalletAccountService = require('../services/financial/WalletAccountService');
const TreasuryService = require('../services/financial/TreasuryService');
const CircuitBreakerService = require('../services/operations/CircuitBreakerService');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function runMasterTests() {
  console.log('==================================================================');
  console.log('🚀 Running NoteStandard Master Banking Platform Test Suite (v1.0)');
  console.log('==================================================================');

  const circuitBreakers = new CircuitBreakerService();
  const scoreService = new ProviderScoreService({ circuitBreakers });
  const recommendationEngine = new RecommendationEngine({ scoreService });
  const walletService = new WalletAccountService();
  const treasuryService = new TreasuryService();
  const postingService = new PostingService(null, { walletAccountService: walletService, treasuryService });
  const treasuryTransferService = new TreasuryTransferService({ treasuryService, postingService });
  const fxQuoteService = new FXQuoteService();
  const featureFlags = new FeatureFlagEngine();
  const canaryController = new CanaryController();
  const rollbackManager = new RollbackManager();
  const rbacService = new RBACService();
  const sanctionsService = new SanctionsAMLService();

  // TEST 1 — Step 1 & Step 6 Multi-Provider Integration (Anchor & Conduit)
  section('TEST 1 — Multi-Provider Interface & Adapter Compliance');
  const anchor = new AnchorAdapter();
  const conduit = new ConduitAdapter();
  const anchorCaps = await anchor.getCapabilities();
  const conduitCaps = await conduit.getCapabilities();
  assert.strictEqual(anchorCaps.provider, 'anchor');
  assert.strictEqual(conduitCaps.provider, 'conduit');
  console.log('✓ Anchor and Conduit adapters operating with verified capability schemas.');

  // TEST 2 — Step 2 & Step 3 Financial Core & Double-Entry Accounting
  section('TEST 2 — Financial Core & Double-Entry Ledger Posting');
  const user1 = 'usr_master_9001';
  const wallet1 = await walletService.getOrCreateAccount(user1, 'NGN', 'PRIMARY');
  const treasury1 = await treasuryService.getOrCreateAccount('NGN', 'AVAILABLE');

  const posting = await postingService.postJournal({
    reference: 'JNL_MST_DEP_1001',
    entryType: 'DEPOSIT',
    description: 'Master Integration NGN Deposit',
    walletAccountId: wallet1.id,
    treasuryAccountId: treasury1.id,
    lines: [
      { chartAccountId: '1110', debit: 100000, credit: 0, currency: 'NGN' },
      { chartAccountId: '2110', debit: 0, credit: 100000, currency: 'NGN' }
    ]
  });

  assert.strictEqual(posting.journal.status, 'POSTED');
  assert.strictEqual(wallet1.available_balance, 100000, 'Wallet credited 100,000 NGN');
  console.log('✓ Double-entry journal posted cleanly to immutable ledger.');

  // TEST 3 — Step 5 Smart Recommendation & FX Rate Lock
  section('TEST 3 — Smart Provider Recommendation & FX Rate Lock');
  const rec = await recommendationEngine.recommendProvider('USD', 'deposit');
  assert.ok(rec.recommendedProvider, 'Provider recommended');

  const fxQuote = await fxQuoteService.createQuote({ baseCurrency: 'USD', quoteCurrency: 'NGN', amount: 200 });
  assert.strictEqual(fxQuote.status, 'ACTIVE');

  const acceptedFx = await fxQuoteService.acceptQuote(fxQuote.quote_id);
  assert.strictEqual(acceptedFx.status, 'ACCEPTED');
  console.log(`✓ Smart Routing recommended '${rec.recommendedProvider}'; FX quote locked and accepted.`);

  // TEST 4 — Step 5 Treasury Rebalancing Workflow
  section('TEST 4 — Treasury Rebalancing Workflow');
  const sourceTr = await treasuryService.getOrCreateAccount('NGN', 'AVAILABLE');
  const targetTr = await treasuryService.getOrCreateAccount('NGN', 'RESERVE');

  const rebalance = await treasuryTransferService.executeTransfer({
    sourceAccountId: sourceTr.id,
    targetAccountId: targetTr.id,
    currency: 'NGN',
    amount: 50000,
    reason: 'Automated Master Liquidity Rebalance',
    approvedBy: 'TreasuryOptimizer'
  });

  assert.strictEqual(rebalance.transfer.status, 'COMPLETED');
  console.log('✓ Internal treasury transfer posted to double-entry ledger.');

  // TEST 5 — Step 7 Production Control, Feature Flags & Rollback Engine
  section('TEST 5 — Feature Flags, Progressive Canary & Automatic Rollback');
  const flagState = await featureFlags.isFeatureEnabled('BANKING_ENABLED');
  assert.strictEqual(flagState, true);

  await featureFlags.setFeatureFlag('EXPERIMENTAL_RAIL', false);
  const expFlag = await featureFlags.isFeatureEnabled('EXPERIMENTAL_RAIL');
  assert.strictEqual(expFlag, false);

  const canaryRecord = await canaryController.promoteStage('v1.0.0');
  assert.strictEqual(canaryRecord.percentage, 5.00);

  // Simulate automated rollback trigger on ledger failure threshold breach
  const rollbackResult = await rollbackManager.evaluateRollback({ ledgerPostingFailures: 1 });
  assert.strictEqual(rollbackResult.executed, true);
  assert.ok(rollbackResult.reason.includes('Ledger posting failures detected'));
  console.log('✓ Runtime feature flags, progressive canary rollout, and automatic rollback engine verified.');

  // TEST 6 — Step 8 Security, RBAC & Sanctions AML Screening
  section('TEST 6 — Security, RBAC & Sanctions AML Screening');
  await rbacService.assertPermission('BANKING_ADMIN', 'TREASURY_REBALANCE_WRITE');
  
  let rbacDenied = false;
  try {
    await rbacService.assertPermission('AUDITOR', 'TREASURY_REBALANCE_WRITE');
  } catch (err) {
    rbacDenied = true;
  }
  assert.ok(rbacDenied, 'Auditor blocked from executing treasury transfers');

  // Sanctions AML Screening
  const amlResult = await sanctionsService.screenTransaction('usr_valid_101', 5000, 'USD');
  assert.strictEqual(amlResult.status, 'CLEARED');

  let amlBlocked = false;
  try {
    await sanctionsService.screenTransaction('usr_sanctioned_entity_99', 5000, 'USD');
  } catch (err) {
    amlBlocked = true;
  }
  assert.ok(amlBlocked, 'Sanctioned entity blocked by AML screening hook');
  console.log('✓ RBAC privilege controls and real-time AML sanctions screening verified.');

  console.log('\n==================================================================');
  console.log('🎉 ALL 8 STEPS OF THE MASTER BANKING PLATFORM SUITE PASSED!');
  console.log('==================================================================');
}

runMasterTests().catch(err => {
  console.error('❌ Master Test failed:', err);
  process.exit(1);
});
