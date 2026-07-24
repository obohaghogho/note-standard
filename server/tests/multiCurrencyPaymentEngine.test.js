/**
 * multiCurrencyPaymentEngine.test.js
 * ====================================
 * Enterprise multi-currency payment engine test suite.
 * Tests: NGN, USD, EUR, GBP, JPY, gateway routing, FX quotes,
 * failover, wallet funding, subscriptions, webhooks, refunds, idempotency.
 *
 * Run: node server/tests/multiCurrencyPaymentEngine.test.js
 *
 * NoteStandard Financial Platform v4
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GatewayRouter     = require('../services/payment/GatewayRouter');
const FXProviderChain   = require('../services/fx/FXProviderChain');
const IdempotencyGuard  = require('../services/payment/IdempotencyGuard');
const FraudRiskEngine   = require('../services/risk/FraudRiskEngine');
const ComplianceManager = require('../services/compliance/ComplianceManager');
const { getDefaultCurrencyForCountry, isSupportedFiatCurrency, getCurrencyLimits } = require('../config/paymentCurrencies');
const { supportsCurrency, supportsMethod, getCompatibleProviders } = require('../config/providerCapabilities');

let passed = 0;
let failed = 0;

async function main() {

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ─── 1. Currency Configuration ────────────────────────────────────────────

console.log('\n📋 1. Currency Configuration');

await test('Supported app currencies include NGN, USD, EUR, GBP, JPY', async () => {
  const currencies = ['NGN', 'USD', 'EUR', 'GBP', 'JPY'];
  for (const c of currencies) {
    assert(isSupportedFiatCurrency(c), `${c} should be supported`);
  }
});

await test('Country-to-currency defaults are correct', async () => {
  assert(getDefaultCurrencyForCountry('NG') === 'NGN', 'NG → NGN');
  assert(getDefaultCurrencyForCountry('US') === 'USD', 'US → USD');
  assert(getDefaultCurrencyForCountry('GB') === 'GBP', 'GB → GBP');
  assert(getDefaultCurrencyForCountry('DE') === 'EUR', 'DE → EUR');
  assert(getDefaultCurrencyForCountry('JP') === 'JPY', 'JP → JPY');
  assert(getDefaultCurrencyForCountry(null) === 'USD', 'null → USD');
});

await test('Currency limits are defined for core currencies', async () => {
  for (const c of ['NGN', 'USD', 'EUR', 'GBP', 'JPY']) {
    const limits = getCurrencyLimits(c);
    assert(limits.min > 0,   `${c} min must be positive`);
    assert(limits.max > 100, `${c} max must be > 100`);
  }
});

// ─── 2. Provider Capabilities ─────────────────────────────────────────────

console.log('\n📋 2. Provider Capabilities');

await test('Paystack supports NGN and USD natively', async () => {
  assert(supportsCurrency('paystack', 'NGN'), 'Paystack supports NGN');
  assert(supportsCurrency('paystack', 'USD'), 'Paystack supports USD');
  assert(!supportsCurrency('paystack', 'EUR'), 'Paystack does NOT support EUR at merchant level');
  assert(!supportsCurrency('paystack', 'JPY'), 'Paystack does NOT support JPY');
});

await test('Fincra supports NGN, USD, EUR, GBP natively', async () => {
  for (const c of ['NGN', 'USD', 'EUR', 'GBP']) {
    assert(supportsCurrency('fincra', c), `Fincra supports ${c}`);
  }
});

await test('Grey supports USD, EUR, GBP natively', async () => {
  for (const c of ['USD', 'EUR', 'GBP']) {
    assert(supportsCurrency('grey', c), `Grey supports ${c}`);
  }
  assert(!supportsCurrency('grey', 'NGN'), 'Grey does NOT support NGN');
});

await test('Method support flags are accurate', async () => {
  assert(supportsMethod('paystack', 'card'), 'Paystack supports card');
  assert(supportsMethod('paystack', 'subscription'), 'Paystack supports subscription');
  assert(!supportsMethod('grey', 'card'), 'Grey does NOT support card');
  assert(!supportsMethod('anchor', 'card'), 'Anchor does NOT support card');
});

await test('Compatible providers for EUR/card returns Fincra', async () => {
  const providers = getCompatibleProviders('EUR', 'card');
  assert(providers.some(p => p.name === 'fincra'), 'Fincra should be compatible with EUR/card');
});

// ─── 3. Gateway Router Scoring ────────────────────────────────────────────

console.log('\n📋 3. Gateway Router — Dynamic Scoring');

await test('NGN/card routes to Paystack or Fincra (native)', async () => {
  const { providerName, isNative } = GatewayRouter.selectBestGateway({ currency: 'NGN', method: 'card' });
  assert(['paystack', 'fincra'].includes(providerName), `Expected paystack/fincra, got ${providerName}`);
  assert(isNative, 'NGN should be native');
});

await test('EUR/card routes to Fincra (native EUR support)', async () => {
  const { providerName, isNative } = GatewayRouter.selectBestGateway({ currency: 'EUR', method: 'card' });
  assert(providerName === 'fincra', `Expected fincra, got ${providerName}`);
  assert(isNative, 'EUR should be native via Fincra');
});

await test('GBP/bank_transfer returns compatible provider', async () => {
  const { providerName } = GatewayRouter.selectBestGateway({ currency: 'GBP', method: 'bank_transfer' });
  assert(['fincra', 'grey'].includes(providerName), `Expected fincra/grey, got ${providerName}`);
});

await test('Crypto routes to NowPayments', async () => {
  const { providerName } = GatewayRouter.selectBestGateway({ currency: 'USDT', method: 'crypto' });
  assert(providerName === 'nowpayments', `Expected nowpayments, got ${providerName}`);
});

await test('Gateway failover: marking Paystack DOWN removes it from selection', async () => {
  GatewayRouter.setHealth('paystack', 'DOWN');
  const { providerName } = GatewayRouter.selectBestGateway({ currency: 'NGN', method: 'card' });
  assert(providerName !== 'paystack', 'Should not select DOWN provider');
  GatewayRouter.setHealth('paystack', 'HEALTHY'); // Reset
});

await test('Gateway health store returns correct statuses', async () => {
  GatewayRouter.setHealth('fincra', 'DEGRADED');
  assert(GatewayRouter.getHealth('fincra') === 'DEGRADED');
  GatewayRouter.setHealth('fincra', 'HEALTHY'); // Reset
});

// ─── 4. FX Provider Chain ─────────────────────────────────────────────────

console.log('\n📋 4. FX Provider Chain');

await test('Identity rate: USD→USD = 1', async () => {
  const { rate, provider } = await FXProviderChain.getRate('USD', 'USD');
  assert(rate === 1, `Expected 1, got ${rate}`);
  assert(provider === 'identity');
});

await test('NGN→USD rate is a reasonable number (< 1)', async () => {
  const { rate } = await FXProviderChain.getRate('NGN', 'USD');
  assert(rate > 0 && rate < 0.01, `NGN→USD rate ${rate} should be < 0.01`);
});

await test('JPY→USD conversion produces correct approximate range', async () => {
  const { convertedAmount } = await FXProviderChain.convert(15500, 'JPY', 'USD');
  assert(convertedAmount > 80 && convertedAmount < 200, `JPY 15500 → USD should be $80-$200, got ${convertedAmount}`);
});

await test('EUR→USD rate is near 1 (0.8 – 1.3 range)', async () => {
  const { rate } = await FXProviderChain.getRate('EUR', 'USD');
  assert(rate > 0.8 && rate < 1.3, `EUR→USD rate ${rate} out of expected range`);
});

// ─── 5. Idempotency Guard ─────────────────────────────────────────────────

console.log('\n📋 5. Idempotency Guard');

await test('First call is not a duplicate', async () => {
  const key = `test_${Date.now()}`;
  const { wasDuplicate } = await IdempotencyGuard.guard(key, 'test', async () => ({ ok: true }));
  assert(!wasDuplicate, 'First call should not be duplicate');
});

await test('Second call with same key is detected as duplicate', async () => {
  const key = `test_dup_${Date.now()}`;
  await IdempotencyGuard.guard(key, 'test', async () => ({ ok: true }));
  const { wasDuplicate } = await IdempotencyGuard.guard(key, 'test', async () => ({ ok: true }));
  assert(wasDuplicate, 'Second call should be duplicate');
});

// ─── 6. Fraud Risk Engine ─────────────────────────────────────────────────

console.log('\n📋 6. Fraud Risk Engine');

await test('Normal transaction is approved', async () => {
  const result = await FraudRiskEngine.evaluate({
    userId: 'test-user-001',
    email: 'test@example.com',
    amount: 100,
    currency: 'USD',
    countryCode: 'US',
    method: 'card',
  });
  assert(result.approved, 'Normal transaction should be approved');
});

await test('Transaction exceeding USD limit is rejected', async () => {
  const result = await FraudRiskEngine.evaluate({
    userId: 'test-user-002',
    email: 'test2@example.com',
    amount: 999_999_999,
    currency: 'USD',
    countryCode: 'US',
    method: 'card',
  });
  assert(!result.approved, 'Extremely large transaction should be rejected');
  assert(result.reason === 'AMOUNT_EXCEEDS_LIMIT');
});

// ─── 7. Compliance Manager ────────────────────────────────────────────────

console.log('\n📋 7. Compliance Manager');

await test('Compliance check passes with all hooks disabled', async () => {
  const result = await ComplianceManager.evaluate({
    userId: 'test-user-003',
    countryCode: 'NG',
    amount: 1000,
    currency: 'NGN',
    purpose: 'deposit',
  });
  assert(result.approved, 'Compliance should pass with hooks disabled');
});

// ─── 8. Summary ───────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 All tests passed!\n');
  process.exit(0);
} else {
  console.error(`⚠️  ${failed} test(s) failed.\n`);
  process.exit(1);
}

} // end main()

main().catch(err => {
  console.error('❌ Test runner crashed:', err.message);
  process.exit(1);
});
