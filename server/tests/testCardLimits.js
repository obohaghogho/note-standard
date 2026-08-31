const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const InternationalCardService = require('../services/internationalCardService');

async function testCardLimitsEngine() {
  console.log('=== TESTING CARD LIMITS & INTERNATIONAL CARD SERVICE ===');

  // Test 1: FX conversion to USD
  const ngnInUsd = InternationalCardService.convertToUsd(750000, 'NGN');
  console.log(`[Test 1] ₦750,000 NGN in USD: $${ngnInUsd.toFixed(2)} (Expected ~500.00 USD)`);
  if (Math.abs(ngnInUsd - 502.5) > 50) {
    throw new Error(`FX conversion error for NGN: got ${ngnInUsd}`);
  }

  const eurInUsd = InternationalCardService.convertToUsd(100, 'EUR');
  console.log(`[Test 2] €100 EUR in USD: $${eurInUsd.toFixed(2)} (Expected ~108.00 USD)`);
  if (eurInUsd !== 108.0) {
    throw new Error(`FX conversion error for EUR: got ${eurInUsd}`);
  }

  // Test 3: International payment detection
  const isUsdInt = InternationalCardService.isInternationalPayment('USD');
  console.log(`[Test 3] Is USD international payment: ${isUsdInt} (Expected true)`);
  if (!isUsdInt) throw new Error('USD payment failed international detection');

  const isNgnInt = InternationalCardService.isInternationalPayment('NGN');
  console.log(`[Test 4] Is NGN international payment: ${isNgnInt} (Expected false)`);
  if (isNgnInt) throw new Error('NGN payment failed domestic detection');

  // Test 5: Decline diagnostics
  const limitDiag = InternationalCardService.getDeclineDiagnostic('EXCEEDS_DAILY_LIMIT', true);
  console.log('[Test 5] Limit decline diagnostic:', limitDiag.title);
  if (!limitDiag.title.includes('Daily Card Limit')) {
    throw new Error('Decline diagnostic failed for EXCEEDS_DAILY_LIMIT');
  }

  // Test 6: Limit summary format
  const summaryTier1 = InternationalCardService.formatLimitSummary(1, null);
  console.log(`[Test 6] Tier 1 USD Deposit Limit: $${summaryTier1.depositLimitUsd}, NGN: ₦${summaryTier1.domesticCardLimitNgn.toLocaleString()}`);
  if (summaryTier1.depositLimitUsd !== 500) {
    throw new Error(`Tier 1 deposit limit mismatch: got ${summaryTier1.depositLimitUsd}`);
  }

  console.log('✅ ALL CARD LIMIT & INTERNATIONAL TESTS PASSED SUCCESSFULLY!');
}

testCardLimitsEngine().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
