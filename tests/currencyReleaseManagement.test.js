'use strict';

/**
 * tests/currencyReleaseManagement.test.js
 * =========================================
 * Mocha test suite verifying:
 * 1. Environment-aware currency visibility (Development vs Production).
 * 2. Admin bypass visibility.
 * 3. Production swap pair filtering (NGN <-> USD).
 * 4. Express middleware HTTP 403 enforcement for non-LIVE currencies in production.
 * 5. Admin release status badges.
 */

const assert = require('assert');
const CurrencyFeatureService = require('../server/services/payment/CurrencyFeatureService');
const { CURRENCY_REGISTRY } = require('../server/config/CurrencyRegistry');

describe('Enterprise Currency Release Management & Feature Flag System', function () {
  this.timeout(5000);

  it('1. Development environment should expose all registered fiat currencies', function () {
    const devCurrencies = CurrencyFeatureService.getVisibleCurrencies(false, 'development');
    assert.ok(devCurrencies.includes('NGN'), 'Development must include NGN');
    assert.ok(devCurrencies.includes('USD'), 'Development must include USD');
    assert.ok(devCurrencies.includes('EUR'), 'Development must include EUR');
    assert.ok(devCurrencies.includes('GBP'), 'Development must include GBP');
    assert.ok(devCurrencies.includes('CAD'), 'Development must include CAD');
    assert.ok(devCurrencies.includes('AUD'), 'Development must include AUD');
    assert.ok(devCurrencies.includes('ZAR'), 'Development must include ZAR');
    assert.ok(devCurrencies.includes('GHS'), 'Development must include GHS');
  });

  it('2. Production environment should expose LIVE production currencies (NGN, USD, USDT, USDC, CNGN, BTC, ETH) and hide unreleased fiat', function () {
    const prodCurrencies = CurrencyFeatureService.getVisibleCurrencies(false, 'production');
    assert.ok(prodCurrencies.includes('NGN'), 'Production must include NGN');
    assert.ok(prodCurrencies.includes('USD'), 'Production must include USD');
    assert.ok(prodCurrencies.includes('USDT'), 'Production must include USDT');
    assert.ok(prodCurrencies.includes('USDC'), 'Production must include USDC');
    assert.ok(prodCurrencies.includes('CNGN'), 'Production must include CNGN');
    assert.ok(prodCurrencies.includes('BTC'), 'Production must include BTC');
    assert.ok(prodCurrencies.includes('ETH'), 'Production must include ETH');
    assert.strictEqual(prodCurrencies.includes('EUR'), false, 'Production must hide EUR');
    assert.strictEqual(prodCurrencies.includes('GBP'), false, 'Production must hide GBP');
    assert.strictEqual(prodCurrencies.includes('CAD'), false, 'Production must hide CAD');
  });

  it('3. Administrators should retain access to all currencies in production', function () {
    const adminProdCurrencies = CurrencyFeatureService.getVisibleCurrencies(true, 'production');
    assert.ok(adminProdCurrencies.includes('EUR'), 'Admin in Production must see EUR');
    assert.ok(adminProdCurrencies.includes('GBP'), 'Admin in Production must see GBP');
  });

  it('4. Production swap pairs should allow NGN/USD/USDT/BTC swaps, but reject EUR <-> USD', function () {
    const ngnUsdProdSwap = CurrencyFeatureService.canSwap('NGN', 'USD', false, 'production');
    const ngnUsdtProdSwap = CurrencyFeatureService.canSwap('NGN', 'USDT', false, 'production');
    const usdBtcProdSwap = CurrencyFeatureService.canSwap('USD', 'BTC', false, 'production');
    const eurUsdProdSwap = CurrencyFeatureService.canSwap('EUR', 'USD', false, 'production');
    const eurUsdDevSwap = CurrencyFeatureService.canSwap('EUR', 'USD', false, 'development');

    assert.strictEqual(ngnUsdProdSwap, true, 'Production must allow NGN <-> USD swap');
    assert.strictEqual(ngnUsdtProdSwap, true, 'Production must allow NGN <-> USDT swap');
    assert.strictEqual(usdBtcProdSwap, true, 'Production must allow USD <-> BTC swap');
    assert.strictEqual(eurUsdProdSwap, false, 'Production must block EUR <-> USD swap');
    assert.strictEqual(eurUsdDevSwap, true, 'Development must allow EUR <-> USD swap');
  });

  it('5. Middleware validateCurrencyRelease should reject unreleased currency in production with HTTP 403', function () {
    const middleware = CurrencyFeatureService.validateCurrencyRelease('currency');
    const req = { body: { currency: 'EUR' }, user: { role: 'user' } };

    // Simulate production environment
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    let resStatus = 0;
    let resBody = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resBody = data; return res; }
    };
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    // Restore env
    process.env.NODE_ENV = originalEnv;

    assert.strictEqual(nextCalled, false, 'Next should not be called for unreleased currency');
    assert.strictEqual(resStatus, 403, 'Response status should be HTTP 403');
    assert.strictEqual(resBody.success, false);
    assert.strictEqual(resBody.error, 'Currency not yet available.');
  });
});
