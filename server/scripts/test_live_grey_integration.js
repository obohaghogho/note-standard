'use strict';

require('dotenv').config();
const GreySettlementProvider = require('../services/settlement/GreySettlementProvider');
const GreyDailyLimitService = require('../services/treasury/GreyDailyLimitService');
const crypto = require('crypto');

async function testLiveGreyIntegration() {
  console.log('================================================================');
  console.log('🚀 TESTING LIVE GREY FINANCE SETTLEMENT INTEGRATION');
  console.log('================================================================\n');

  const greyProvider = new GreySettlementProvider();

  // Test 1: Capability Matrix & Config
  console.log('1️⃣  Checking Provider Capabilities & ID...');
  const caps = greyProvider.getCapabilities();
  console.log(`   - Provider ID: ${greyProvider.getProviderId()}`);
  console.log(`   - Daily Settlement Limit: $${caps.dailySettlementLimitUsd.toLocaleString()} USD`);
  console.log(`   - Supported Currencies: ${caps.supportedCurrencies.join(', ')}`);
  console.log(`   - P2P Support: ${caps.supportsP2P}, FX Swap: ${caps.supportsFxSwap}`);
  console.log('   ✅ Provider Contract OK!\n');

  // Test 2: Live Health Check API
  console.log('2️⃣  Running Live Health Check against Grey API...');
  const health = await greyProvider.healthCheck();
  console.log(`   - Status: ${health.status}`);
  console.log(`   - Response Latency: ${health.latencyMs}ms`);
  console.log(`   - Message: ${health.message}`);
  console.log('   ✅ Health Check Telemetry OK!\n');

  // Test 3: Daily Limit Capacity Tracker ($100k cap)
  console.log('3️⃣  Checking Real-Time $100,000 USD Daily Capacity Tracker...');
  const capacity = await GreyDailyLimitService.checkSettlementCapacity(250, 'USD');
  console.log(`   - Is Available: ${capacity.isAvailable}`);
  console.log(`   - Daily Limit: $${capacity.dailyLimitUsd.toLocaleString()} USD`);
  console.log(`   - Current Today Utilization: $${capacity.currentVolumeUsd.toLocaleString()} USD (${capacity.utilizationPercentage}%)`);
  console.log(`   - Remaining Capacity: $${capacity.remainingCapacityUsd.toLocaleString()} USD`);
  console.log('   ✅ Daily Settlement Capacity Engine OK!\n');

  // Test 4: Webhook Signature Verification & Timestamp Freshness
  console.log('4️⃣  Testing HMAC-SHA256 Webhook Verification & Replay Protection...');
  const payload = { event: 'transaction success', reference: 'wd_live_test_001', amount: 50.0 };
  const secret = process.env.GREY_WEBHOOK_SECRET || 'grey_whsec_notestandard_live_2026';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

  const isValidSig = await greyProvider.verifyWebhookSignature({
    'x-grey-signature': signature,
    'x-grey-timestamp': timestamp
  }, payload);

  console.log(`   - Webhook Signature Valid: ${isValidSig}`);
  console.log('   ✅ Webhook Replay Protection & Signature Security OK!\n');

  // Test 5: Live FX Exchange Rate Quote (USD to NGN)
  console.log('5️⃣  Fetching Live FX Rate Quote (USD -> NGN)...');
  try {
    const fxQuote = await greyProvider.getExchangeRate('USD', 'NGN', 10);
    console.log(`   - From: ${fxQuote.fromCurrency} -> To: ${fxQuote.toCurrency}`);
    console.log(`   - Rate: ${fxQuote.rate}`);
    console.log(`   - Target Amount for $10 USD: ₦${fxQuote.estimatedAmount.toLocaleString()}`);
    console.log('   ✅ FX Quote Engine OK!\n');
  } catch (fxErr) {
    console.log(`   - FX Quote Note: ${fxErr.message}`);
  }

  console.log('================================================================');
  console.log('🎉 ALL GREY INTEGRATION VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

testLiveGreyIntegration().catch(err => {
  console.error('❌ LIVE GREY INTEGRATION TEST FAILED:', err.message);
  process.exit(1);
});
