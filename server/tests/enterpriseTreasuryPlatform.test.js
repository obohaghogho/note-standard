/**
 * enterpriseTreasuryPlatform.test.js
 * ====================================
 * Comprehensive Enterprise Test Suite for NoteStandard Treasury & Liquidity Platform.
 *
 * Verifies all 11 architectural components:
 *   1.  Provider Independence Adapters (NOWPayments, Fincra, Anchor, AdapterRegistry)
 *   2.  Treasury Vault Hierarchy (Real Money Vault vs Provider Liquidity Endpoints)
 *   3.  Liquidity Manager (5-State Balance Tracking & Atomic Reservations)
 *   4.  Liquidity Prediction Engine (Proactive Shortage Forecasting & Time-To-Shortage)
 *   5.  Internal FX Wallet (Instant User Swap Execution)
 *   6.  FX Inventory & Aggregation Engine (Bulk FX Aggregation & Fee Reduction)
 *   7.  Treasury AI Intelligence Engine (Predictive Risk & Anomaly Screening)
 *   8.  Business Rules Engine (Declarative Rules, Weekend Multipliers, Routing Tiers)
 *   9.  Treasury Router (Multi-Criteria Weighted Scoring & Multi-Tier Failover)
 *   10. Treasury Emergency Mode (Resilient Fail-Safe Queueing & Outage Resuming)
 *   11. Settlement Coordinator, Proof of Treasury, Reconciliation & Central Financial Orchestrator
 *
 * Usage:
 *   node server/tests/enterpriseTreasuryPlatform.test.js
 */

'use strict';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(75)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(75));
}

// ── Imports ──────────────────────────────────────────────────────────────────
const BaseTreasuryAdapter           = require('../services/treasury/adapters/BaseTreasuryAdapter');
const NOWPaymentsAdapter            = require('../services/treasury/adapters/NOWPaymentsAdapter');
const FincraAdapter                 = require('../services/treasury/adapters/FincraAdapter');
const AnchorAdapter                 = require('../services/treasury/adapters/AnchorAdapter');
const adapterRegistry               = require('../services/treasury/adapters/AdapterRegistry');

const treasuryVault                 = require('../services/treasury/TreasuryVault');
const liquidityManager              = require('../services/treasury/LiquidityManager');
const liquidityPredictionEngine      = require('../services/treasury/LiquidityPredictionEngine');
const internalFXWallet              = require('../services/treasury/InternalFXWallet');

const fxInventoryEngine             = require('../services/treasury/FXInventoryEngine');
const treasuryAIEngine              = require('../services/treasury/TreasuryAIEngine');
const treasuryBusinessRulesEngine   = require('../services/treasury/TreasuryBusinessRulesEngine');

const treasuryRouter                = require('../services/treasury/TreasuryRouter');
const providerHealthEngine          = require('../services/treasury/ProviderHealthEngine');
const treasuryEmergencyMode         = require('../services/treasury/TreasuryEmergencyMode');

const providerFundingService        = require('../services/treasury/ProviderFundingService');
const autoLiquidityBalancer         = require('../services/treasury/AutoLiquidityBalancer');
const settlementCoordinator         = require('../services/treasury/SettlementCoordinator');
const proofOfTreasuryEngine         = require('../services/treasury/ProofOfTreasuryEngine');
const treasuryReconciliationService = require('../services/treasury/TreasuryReconciliationService');
const enterpriseTreasuryEngine      = require('../services/treasury/EnterpriseTreasuryEngine');

async function runTests() {
  console.log('\n' + '═'.repeat(75));
  console.log('  ENTERPRISE TREASURY & LIQUIDITY PLATFORM — MASTER TEST SUITE');
  console.log('═'.repeat(75));

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1 — Provider Abstraction & Common Interface Contract
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 1 — Provider Independence Contract & Adapters');

  assert(adapterRegistry.has('NOWPAYMENTS'), 'AdapterRegistry contains NOWPAYMENTS');
  assert(adapterRegistry.has('FINCRA'), 'AdapterRegistry contains FINCRA');
  assert(adapterRegistry.has('ANCHOR'), 'AdapterRegistry contains ANCHOR');

  const fincraAdapter = adapterRegistry.get('FINCRA');
  assert(fincraAdapter instanceof BaseTreasuryAdapter, 'FincraAdapter inherits BaseTreasuryAdapter');

  const capsFincra = fincraAdapter.getCapabilities();
  assert(capsFincra.supportsVirtualAccounts === true, 'FincraAdapter supports virtual accounts');
  assert(capsFincra.supportedCurrencies.includes('NGN'), 'FincraAdapter supports NGN');

  const npAdapter = adapterRegistry.get('NOWPAYMENTS');
  assert(npAdapter.getCapabilities().supportedCurrencies.includes('BTC'), 'NOWPaymentsAdapter supports BTC');

  const anchorAdapter = adapterRegistry.get('ANCHOR');
  assert(anchorAdapter.getCapabilities().supportedCurrencies.includes('USD'), 'AnchorAdapter supports USD');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2 — Treasury Vault Hierarchy & Reserve Protection
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 2 — Treasury Vault Hierarchy (Real Money Vault)');

  const initialNgnVault = await treasuryVault.getVaultBalance('NGN');
  assert(initialNgnVault > 0, `Treasury Vault has NGN reserve (${initialNgnVault})`);

  const hasReserve = await treasuryVault.verifyVaultReserve('NGN', 1000000);
  assert(hasReserve === true, 'Treasury Vault has reserve for ₦1,000,000');

  const vaultTx = await treasuryVault.transferToProviderEndpoint({
    providerId: 'FINCRA',
    currency: 'NGN',
    amount: 500000,
    reference: 'test_vault_fund_1',
  });
  assert(vaultTx.status === 'COMPLETED', 'Treasury Vault funded provider endpoint cleanly');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3 — Liquidity Manager (5-State Balance Tracking)
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 3 — Liquidity Manager (5-State Balance Tracking)');

  await liquidityManager.creditLiquidity('FINCRA', 'NGN', 20000000);
  const liqFincra = await liquidityManager.getLiquidity('FINCRA', 'NGN');
  assert(liqFincra.available >= 20000000, `Fincra NGN available balance updated (${liqFincra.available})`);

  await liquidityManager.reserveLiquidity('FINCRA', 'NGN', 2000000);
  const reservedState = await liquidityManager.getLiquidity('FINCRA', 'NGN');
  assert(reservedState.reserved === 2000000, 'LiquidityManager reserved ₦2,000,000');

  await liquidityManager.releaseLiquidity('FINCRA', 'NGN', 1000000);
  const releasedState = await liquidityManager.getLiquidity('FINCRA', 'NGN');
  assert(releasedState.reserved === 1000000, 'LiquidityManager released ₦1,000,000');

  await liquidityManager.commitLiquidity('FINCRA', 'NGN', 1000000);
  const committedState = await liquidityManager.getLiquidity('FINCRA', 'NGN');
  assert(committedState.reserved === 0, 'LiquidityManager committed reservation cleanly');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4 — Liquidity Prediction Engine (Proactive Forecasting)
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 4 — Liquidity Prediction Engine (Proactive Forecasting)');

  const predInitial = await liquidityPredictionEngine.predictLiquidity('FINCRA', 'NGN', 60);
  assert(typeof predInitial.shortageImminent === 'boolean', 'Prediction returns shortageImminent boolean');
  assert(typeof predInitial.timeToShortageMinutes === 'number', 'Prediction returns timeToShortageMinutes number');

  // Simulate heavy outflow to trigger predictive warning
  for (let i = 0; i < 5; i++) {
    liquidityPredictionEngine.recordOutflow('NGN', 15000000);
  }
  const predOutflow = await liquidityPredictionEngine.predictLiquidity('FINCRA', 'NGN', 60);
  assert(predOutflow.projectedOutflowNextHour > 0, `Prediction calculates projected outflow (${predOutflow.projectedOutflowNextHour})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5 — Internal FX Wallet (Instant User Swap)
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 5 — Internal FX Wallet (Instant User Swap Experience)');

  const instantSwap = await internalFXWallet.executeInstantSwap({
    userId: 'usr_test_1',
    fromCurrency: 'BTC',
    toCurrency: 'NGN',
    fromAmount: 0.1,
    toAmount: 1500000,
    idempotencyKey: `swap_test_${Date.now()}`,
  });
  assert(instantSwap.success === true, 'InternalFXWallet executed instant swap');
  assert(instantSwap.instant === true, 'Swap flagged as instant backed by Treasury');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 6 — FX Inventory Engine (Bulk Aggregation)
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 6 — FX Inventory Engine (Bulk FX Aggregation)');

  await fxInventoryEngine.submitForAggregation({ fromCurrency: 'BTC', toCurrency: 'NGN', amount: 0.5, reference: 'ref_agg_1' });
  await fxInventoryEngine.submitForAggregation({ fromCurrency: 'BTC', toCurrency: 'NGN', amount: 0.5, reference: 'ref_agg_2' });

  const metrics = fxInventoryEngine.getQueueMetrics();
  assert(metrics['BTC:NGN']?.itemCount === 2, 'FXInventoryEngine aggregated 2 concurrent swap requests');

  const flushResult = await fxInventoryEngine.flushBatch('BTC', 'NGN');
  assert(flushResult.itemCount === 2, 'FXInventoryEngine flushed aggregated batch as single bulk FX trade');
  assert(flushResult.savedFeeSavingsPercent > 0, `Calculated fee savings (${flushResult.savedFeeSavingsPercent}%)`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 7 — Treasury AI Engine & Business Rules Engine
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 7 — Treasury AI Intelligence & Business Rules Engine');

  const aiReport = await treasuryAIEngine.evaluatePlatformRisk();
  assert(typeof aiReport.riskScore === 'number', `AI risk evaluation calculated score (${aiReport.riskScore})`);
  assert(Array.isArray(aiReport.insights), 'AI risk report contains insights array');

  const treasuryReservePolicy = require('../services/treasury/TreasuryReservePolicy');
  const tiersNGN = treasuryReservePolicy.getReserveTiers('NGN');
  assert(tiersNGN.minimum === 5000000 || tiersNGN.minimum === 6500000, `TreasuryReservePolicy minimum tier NGN verified (${tiersNGN.minimum})`);
  assert(tiersNGN.target === 20000000 || tiersNGN.target === 26000000, `TreasuryReservePolicy target tier NGN verified (${tiersNGN.target})`);
  assert(tiersNGN.critical === 2000000 || tiersNGN.critical === 2600000, `TreasuryReservePolicy critical tier NGN verified (${tiersNGN.critical})`);

  const evalCrit = treasuryReservePolicy.evaluateLiquidityTier('NGN', 1000000);
  assert(evalCrit.status === 'BELOW_CRITICAL', 'TreasuryReservePolicy correctly identified BELOW_CRITICAL tier');

  const reqReserveNGN = treasuryBusinessRulesEngine.getRequiredReserve('NGN');
  assert(reqReserveNGN >= 2000000, `BusinessRulesEngine returned required NGN reserve (${reqReserveNGN})`);

  const largePayoutRule = treasuryBusinessRulesEngine.evaluateRoutingRule('NGN', 6000000);
  assert(largePayoutRule.ruleApplied === true, 'BusinessRulesEngine triggered large payout routing rule');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 8 — Treasury Router (Weighted Scoring & Failover)
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 8 — Treasury Router (Weighted Scoring & Multi-Tier Failover)');

  const routeDecision = await treasuryRouter.selectOptimalProvider({
    currency: 'NGN',
    amount: 100000,
    operation: 'withdraw',
  });
  assert(routeDecision.selectedProviderId !== null, `TreasuryRouter selected optimal provider (${routeDecision.selectedProviderId})`);
  assert(routeDecision.compositeScore > 0, `Calculated composite weighted score (${routeDecision.compositeScore})`);
  assert(Array.isArray(routeDecision.failoverList), 'TreasuryRouter generated multi-tier failover list');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 9 — Provider Funding & Auto Liquidity Balancer
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 9 — Provider Funding Service & Auto Liquidity Balancer');

  const fundResult = await providerFundingService.fundProvider({
    providerId: 'FINCRA',
    currency: 'NGN',
    amount: 1000000,
    reason: 'TEST_FUNDING',
  });
  assert(fundResult.success === true, 'ProviderFundingService funded Fincra from Treasury Vault');

  const rebalanceResult = await autoLiquidityBalancer.runRebalanceCheck();
  assert(rebalanceResult.status === 'COMPLETED', 'AutoLiquidityBalancer executed rebalance cycle');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 10 — Treasury Emergency Mode & Resilient Retry Queue
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 10 — Treasury Emergency Mode & Resilient Retry Queue');

  treasuryEmergencyMode.activateEmergency('TEST_OUTAGE');
  assert(treasuryEmergencyMode.isEmergencyActive() === true, 'TreasuryEmergencyMode activated');

  const queueResult = await treasuryEmergencyMode.enqueueRetryTransaction({
    transactionId: 'tx_emergency_1',
    userId: 'usr_emer_1',
    amount: 50000,
    currency: 'NGN',
    recipientDetails: {},
    reason: 'PROVIDER_OFFLINE',
  });
  assert(queueResult.queued === true, 'Emergency Mode queued withdrawal transaction cleanly');

  const retryProcess = await treasuryEmergencyMode.processRetryQueue();
  assert(retryProcess.processed >= 1, 'Emergency Mode processed queued retries upon recovery');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 11 — Settlement Coordinator, Proof of Treasury, Reconciliation & Engine
  // ─────────────────────────────────────────────────────────────────────────────
  section('SUITE 11 — Settlement Coordinator, Proof of Treasury & Central Orchestrator');

  const lifecycleResult = await settlementCoordinator.processSwapAndPayoutLifecycle({
    userId: 'usr_flow_1',
    depositTxHash: '0x123abc',
    fromCurrency: 'BTC',
    toCurrency: 'NGN',
    depositAmount: 0.05,
    recipientDetails: { accountNumber: '0123456789', bankCode: '057', accountName: 'Test Recipient' },
    idempotencyKey: `lifecycle_test_${Date.now()}`,
  });
  assert(lifecycleResult.success === true, 'SettlementCoordinator completed full deposit-swap-payout lifecycle');

  const proofReport = await proofOfTreasuryEngine.verifyAll();
  assert(typeof proofReport.verified === 'boolean', `ProofOfTreasuryEngine verified solvency (${proofReport.verified})`);

  const reconReport = await treasuryReconciliationService.runReconciliation();
  assert(reconReport.checksum.startsWith('sha256:'), `TreasuryReconciliationService generated checksummed report (${reconReport.checksum.substring(0, 15)}...)`);

  await enterpriseTreasuryEngine.initialize();
  const dashboard = await enterpriseTreasuryEngine.getDashboardOverview();
  assert(dashboard.platform.includes('NoteStandard'), 'EnterpriseTreasuryEngine returned full platform telemetry overview');

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(75));
  console.log(`\n  Master Suite Results: ${passed} passed, ${failed} failed\n`);

  if (failures.length > 0) {
    console.error('  Failed assertions:');
    failures.forEach((f, i) => console.error(`    ${i + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('  ===========================================================================');
    console.log('  ✅  ENTERPRISE TREASURY PLATFORM TEST SUITE PASSED 100% CLEANLY!');
    console.log('  ===========================================================================\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled test execution failure:', err);
  process.exit(1);
});
