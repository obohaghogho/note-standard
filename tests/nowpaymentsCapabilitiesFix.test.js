'use strict';

/**
 * tests/nowpaymentsCapabilitiesFix.test.js
 * =========================================
 * Tests verifying:
 * 1. ProviderCapabilityRegistry.getMergedCapabilities returns provider = 'nowpayments' and minimum = 15 for USDT and USDC.
 * 2. walletCurrencyCatalog includes USDT and USDC in CRYPTO_CATALOG with type = 'crypto', provider = 'nowpayments', and minimum_deposit = 15.
 */

const assert = require('assert');
const ProviderCapabilityRegistry = require('../server/services/payment/ProviderCapabilityRegistry');
const { getAllCurrencies, getCatalogEntry } = require('../server/config/walletCurrencyCatalog');

describe('NOWPayments Digital Currency Capability & Minimum Deposit Verification Suite', function () {
  this.timeout(5000);

  it('1. ProviderCapabilityRegistry should return provider nowpayments and minimum deposit 15 for USDT', async function () {
    const caps = await ProviderCapabilityRegistry.getMergedCapabilities('FREE');
    const usdtCap = caps.currencies['USDT'];

    assert.ok(usdtCap, 'USDT capability object must exist');
    assert.strictEqual(usdtCap.type, 'crypto', 'USDT type must be crypto');
    assert.ok(usdtCap.depositMethods.length > 0, 'USDT must have deposit methods');

    const mainRail = usdtCap.depositMethods[0];
    assert.strictEqual(mainRail.provider.toLowerCase(), 'nowpayments', 'USDT deposit rail provider must be nowpayments');
    assert.strictEqual(mainRail.limits.minimum, 15, 'USDT deposit minimum limit must be 15');
  });

  it('2. ProviderCapabilityRegistry should return provider nowpayments and minimum deposit 15 for USDC', async function () {
    const caps = await ProviderCapabilityRegistry.getMergedCapabilities('FREE');
    const usdcCap = caps.currencies['USDC'];

    assert.ok(usdcCap, 'USDC capability object must exist');
    assert.strictEqual(usdcCap.type, 'crypto', 'USDC type must be crypto');
    assert.ok(usdcCap.depositMethods.length > 0, 'USDC must have deposit methods');

    const mainRail = usdcCap.depositMethods[0];
    assert.strictEqual(mainRail.provider.toLowerCase(), 'nowpayments', 'USDC deposit rail provider must be nowpayments');
    assert.strictEqual(mainRail.limits.minimum, 15, 'USDC deposit minimum limit must be 15');
  });

  it('3. walletCurrencyCatalog should classify USDT and USDC under CRYPTO_CATALOG with provider nowpayments and 15 USD minimum', function () {
    const usdt = getCatalogEntry('USDT');
    const usdc = getCatalogEntry('USDC');

    assert.ok(usdt, 'USDT config must exist in catalog');
    assert.strictEqual(usdt.type, 'crypto', 'USDT catalog entry type must be crypto');
    assert.strictEqual(usdt.provider, 'nowpayments', 'USDT catalog provider must be nowpayments');
    assert.strictEqual(usdt.minimum_deposit, 15, 'USDT catalog minimum deposit must be 15');

    assert.ok(usdc, 'USDC config must exist in catalog');
    assert.strictEqual(usdc.type, 'crypto', 'USDC catalog entry type must be crypto');
    assert.strictEqual(usdc.provider, 'nowpayments', 'USDC catalog provider must be nowpayments');
    assert.strictEqual(usdc.minimum_deposit, 15, 'USDC catalog minimum deposit must be 15');
  });
});
