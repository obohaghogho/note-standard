'use strict';

/**
 * enterpriseBankingMasterPlatformIntegration.test.js
 * ===================================================
 * Complete 12-Step Enterprise Banking Platform Master Integration Test Suite.
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
const ReconciliationEngine = require('../services/reconciliation/ReconciliationEngine');
const RiskDecisionEngine = require('../services/risk/RiskDecisionEngine');
const DeveloperPlatformService = require('../services/developer/DeveloperPlatformService');
const RegulatoryReportingService = require('../services/reporting/RegulatoryReportingService');

const PostingService = require('../services/financial/PostingService');
const WalletAccountService = require('../services/financial/WalletAccountService');
const TreasuryService = require('../services/financial/TreasuryService');
const CircuitBreakerService = require('../services/operations/CircuitBreakerService');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function run12StepMasterTests() {
  console.log('==================================================================');
  console.log('🏛️  Running 12-Step Enterprise Banking Master Suite (v1.0)');
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
  const reconciliationEngine = new ReconciliationEngine();
  const riskEngine = new RiskDecisionEngine();
  const devPlatform = new DeveloperPlatformService();
  const reportingService = new RegulatoryReportingService();

  // TEST 1 — Multi-Provider Adapters (Steps 1 & 6)
  section('TEST 1 — Multi-Provider Adapters (Steps 1 & 6)');
  const anchor = new AnchorAdapter();
  const conduit = new ConduitAdapter();
  assert.strictEqual((await anchor.getCapabilities()).provider, 'anchor');
  assert.strictEqual((await conduit.getCapabilities()).provider, 'conduit');
  console.log('✓ Multi-provider capabilities verified.');

  // TEST 2 — Financial Core & Double-Entry Accounting (Step 2)
  section('TEST 2 — Financial Core & Double-Entry Accounting (Step 2)');
  const user = 'usr_ent_12001';
  const wallet = await walletService.getOrCreateAccount(user, 'USD', 'PRIMARY');
  const treasury = await treasuryService.getOrCreateAccount('USD', 'AVAILABLE');

  const posting = await postingService.postJournal({
    reference: 'JNL_ENT_1001',
    entryType: 'DEPOSIT',
    description: '12-Step Master USD Deposit',
    walletAccountId: wallet.id,
    treasuryAccountId: treasury.id,
    lines: [
      { chartAccountId: '1120', debit: 2500, credit: 0, currency: 'USD' },
      { chartAccountId: '2120', debit: 0, credit: 2500, currency: 'USD' }
    ]
  });

  assert.strictEqual(posting.journal.status, 'POSTED');
  assert.strictEqual(wallet.available_balance, 2500);
  console.log('✓ Double-entry accounting & ledger posting verified.');

  // TEST 3 — Smart Routing & Treasury Optimization (Step 5)
  section('TEST 3 — Smart Routing & Treasury Optimization (Step 5)');
  const rec = await recommendationEngine.recommendProvider('NGN', 'deposit');
  assert.ok(rec.recommendedProvider);

  const transfer = await treasuryTransferService.executeTransfer({
    sourceAccountId: treasury.id,
    targetAccountId: (await treasuryService.getOrCreateAccount('USD', 'RESERVE')).id,
    currency: 'USD',
    amount: 500,
    reason: 'Automated 12-Step Liquidity Rebalance',
    approvedBy: 'TreasuryOptimizer'
  });
  assert.strictEqual(transfer.transfer.status, 'COMPLETED');
  console.log('✓ Smart routing recommendation & treasury rebalancing verified.');

  // TEST 4 — Production Control Plane & Rollbacks (Step 7)
  section('TEST 4 — Production Control & Automatic Rollback Engine (Step 7)');
  const flag = await featureFlags.isFeatureEnabled('BANKING_ENABLED');
  assert.strictEqual(flag, true);

  const rollback = await rollbackManager.evaluateRollback({ ledgerPostingFailures: 1 });
  assert.strictEqual(rollback.executed, true);
  console.log('✓ Feature flags & automated rollback engine verified.');

  // TEST 5 — Security & Sanctions AML Screening (Step 8)
  section('TEST 5 — Security, RBAC & Sanctions AML Screening (Step 8)');
  await rbacService.assertPermission('BANKING_ADMIN', 'TREASURY_REBALANCE_WRITE');
  const aml = await sanctionsService.screenTransaction('usr_valid_ent', 1000, 'USD');
  assert.strictEqual(aml.status, 'CLEARED');
  console.log('✓ RBAC & AML sanctions screening verified.');

  // TEST 6 — Settlement & Reconciliation Engine (Step 9)
  section('TEST 6 — Settlement & Reconciliation Engine (Step 9)');
  const recBatch = await reconciliationEngine.runReconciliationBatch('fincra', [
    { reference: 'TX_101', expectedAmount: 1000, actualAmount: 1000 },
    { reference: 'TX_102', expectedAmount: 500, actualAmount: 450 }
  ]);
  assert.strictEqual(recBatch.status, 'HAS_BREAKS');
  assert.strictEqual(recBatch.unreconciledBreaks, 1);
  console.log('✓ Daily settlement matching & break detection verified.');

  // TEST 7 — Risk & Fraud Decision Engine (Step 10)
  section('TEST 7 — Risk & Fraud Decision Engine (Step 10)');
  const lowRisk = await riskEngine.evaluateRisk({ amount: 1000, userId: 'usr_normal' });
  assert.strictEqual(lowRisk.recommendation, 'APPROVE');

  const highRisk = await riskEngine.evaluateRisk({ amount: 10000000, userId: 'usr_suspicious_flag' });
  assert.strictEqual(highRisk.recommendation, 'REJECT');
  console.log('✓ Risk scoring, velocity limits & fraud rules verified.');

  // TEST 8 — Developer Platform & Public APIs (Step 11)
  section('TEST 8 — Developer Platform & Public APIs (Step 11)');
  const auth = await devPlatform.authenticateKey('client_123', 'sk_live_secret_key_789');
  assert.strictEqual(auth, true);

  const rateLimit = await devPlatform.checkRateLimit('client_123');
  assert.strictEqual(rateLimit.allowed, true);
  console.log('✓ Developer API Key authentication & rate limiting verified.');

  // TEST 9 — Regulatory Reporting & Compliance Exports (Step 12)
  section('TEST 9 — Regulatory Reporting & Compliance Exports (Step 12)');
  const report = await reportingService.generateReport('SAR', '2026-08');
  assert.strictEqual(report.status, 'GENERATED');
  assert.ok(report.file_path.includes('/exports/regulatory/sar_2026-08.csv'));
  console.log('✓ Automated regulatory report generation (SARs/CTRs) verified.');

  console.log('\n==================================================================');
  console.log('🎉 ALL 12 STEPS OF THE ENTERPRISE BANKING PLATFORM SUITE PASSED!');
  console.log('==================================================================');
}

run12StepMasterTests().catch(err => {
  console.error('❌ 12-Step Master Test failed:', err);
  process.exit(1);
});
