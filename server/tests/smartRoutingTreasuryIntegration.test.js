'use strict';

/**
 * smartRoutingTreasuryIntegration.test.js
 * ========================================
 * Step 5 Smart Routing & Treasury Optimization Integration Test Suite.
 */

const assert = require('assert');
const RecommendationEngine = require('../services/optimization/RecommendationEngine');
const ProviderScoreService = require('../services/optimization/ProviderScoreService');
const TreasuryTransferService = require('../services/optimization/TreasuryTransferService');
const FXQuoteService = require('../services/optimization/FXQuoteService');
const TreasuryService = require('../services/financial/TreasuryService');
const PostingService = require('../services/financial/PostingService');
const CircuitBreakerService = require('../services/operations/CircuitBreakerService');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function runTests() {
  console.log('==================================================================');
  console.log('🚀 Running Step 5 Smart Routing & Treasury Test Suite (v1.0)');
  console.log('==================================================================');

  const circuitBreakers = new CircuitBreakerService();
  const scoreService = new ProviderScoreService({ circuitBreakers });
  const recommendationEngine = new RecommendationEngine({ scoreService });
  const treasuryService = new TreasuryService();
  const postingService = new PostingService(null, { treasuryService });
  const treasuryTransferService = new TreasuryTransferService({ treasuryService, postingService });
  const fxQuoteService = new FXQuoteService({ defaultTtlMs: 200 });

  // TEST 1 — Provider Recommendation Weighted Scoring
  section('TEST 1 — Provider Recommendation Weighted Scoring');
  const recommendation = await recommendationEngine.recommendProvider('NGN', 'deposit');
  assert.strictEqual(recommendation.recommendedProvider, 'fincra', 'Fincra selected based on lowest latency');
  assert.ok(recommendation.score > 0, 'Composite score computed');
  console.log(`✓ Smart Recommendation selected '${recommendation.recommendedProvider}' with composite score: ${recommendation.score}`);

  // TEST 2 — Exclude Degraded/OPEN Circuit Breaker Providers
  section('TEST 2 — Exclude OPEN Circuit Breaker Providers from Recommendation');
  // Trip Fincra's circuit breaker to OPEN
  for (let i = 0; i < 5; i++) {
    circuitBreakers.recordFailure('fincra', new Error('TIMEOUT'));
  }
  assert.strictEqual(circuitBreakers.getBreaker('fincra').state, 'OPEN');

  const recAfterTrip = await recommendationEngine.recommendProvider('NGN', 'deposit');
  assert.strictEqual(recAfterTrip.recommendedProvider, 'anchor', 'Fincra excluded while OPEN; Anchor recommended');
  console.log(`✓ Provider with OPEN circuit breaker excluded; routed to '${recAfterTrip.recommendedProvider}'.`);

  // TEST 3 — Treasury Rebalancing Workflow -> PostingService Journal
  section('TEST 3 — Treasury Rebalancing Workflow -> Step 2 PostingService');
  const sourceTreasury = await treasuryService.getOrCreateAccount('NGN', 'AVAILABLE');
  const targetTreasury = await treasuryService.getOrCreateAccount('NGN', 'RESERVE');

  const transferResult = await treasuryTransferService.executeTransfer({
    sourceAccountId: sourceTreasury.id,
    targetAccountId: targetTreasury.id,
    currency: 'NGN',
    amount: 250000,
    reason: 'Automated 24-hour Liquidity Buffer Rebalance',
    approvedBy: 'TreasuryOptimizer'
  });

  assert.strictEqual(transferResult.transfer.status, 'COMPLETED');
  assert.strictEqual(transferResult.postingResult.journal.status, 'POSTED');
  assert.strictEqual(sourceTreasury.balance, 250000, 'Source treasury balance updated');
  console.log('✓ Internal treasury rebalancing transfer posted to double-entry ledger successfully.');

  // TEST 4 — FX Quote Lifecycle (Rate Lock, Acceptance, Expiration)
  section('TEST 4 — FX Quote Lifecycle (Rate Lock, Acceptance, Expiration)');
  const quote = await fxQuoteService.createQuote({
    baseCurrency: 'USD',
    quoteCurrency: 'NGN',
    amount: 100,
    spread: 0.005
  });

  assert.strictEqual(quote.status, 'ACTIVE');
  assert.strictEqual(quote.mid_rate, 1500);
  assert.strictEqual(quote.converted_amount, 149250); // 100 * 1500 * (1 - 0.005)

  // Accept active quote
  const acceptedQuote = await fxQuoteService.acceptQuote(quote.quote_id);
  assert.strictEqual(acceptedQuote.status, 'ACCEPTED');
  console.log('✓ FX Rate quote locked and accepted before TTL expiration.');

  // TEST 5 — FX Quote Expiration Rejection
  section('TEST 5 — FX Quote Expiration Rejection');
  const shortQuote = await fxQuoteService.createQuote({
    baseCurrency: 'USD',
    quoteCurrency: 'NGN',
    amount: 50
  });

  // Wait 250ms to exceed defaultTtlMs (200ms)
  await new Promise(r => setTimeout(r, 250));

  let expiredError = false;
  try {
    await fxQuoteService.acceptQuote(shortQuote.quote_id);
  } catch (err) {
    expiredError = true;
    assert.ok(err.message.includes('FX_QUOTE_EXPIRED'));
  }
  assert.ok(expiredError, 'Expired quote must be rejected');
  console.log('✓ Expired FX quote rejected correctly after TTL expiration.');

  console.log('\n==================================================================');
  console.log('🎉 ALL STEP 5 SMART ROUTING & TREASURY TESTS PASSED!');
  console.log('==================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
