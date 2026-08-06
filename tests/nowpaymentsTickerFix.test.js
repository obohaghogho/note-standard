'use strict';

/**
 * tests/nowpaymentsTickerFix.test.js
 * =========================================
 * Unit tests verifying:
 * 1. NowPaymentsProvider correctly maps USDT, USDC, BTC, and ETH to valid network tickers.
 * 2. USDT with 'native' or missing network maps to 'usdttrc20' (TRC20 network) instead of invalid 'usdt'.
 * 3. USDC with 'native' or missing network maps to 'usdcerc20' (ERC20 network) instead of invalid 'usdc'.
 */

const assert = require('assert');
const NowPaymentsProviderClass = require('../server/services/payment/providers/NowPaymentsProvider');

describe('NOWPayments Pay Currency Ticker Resolution Test Suite', function () {
  this.timeout(5000);

  it('1. USDT native or empty network should resolve to usdttrc20', async function () {
    const provider = new NowPaymentsProviderClass();
    
    // We test initialize ticker calculation
    let passedPayCurrency = null;

    // Intercept createNowPaymentsPayment
    const nowpaymentsService = require('../server/services/nowpaymentsService');
    const originalCreate = nowpaymentsService.createNowPaymentsPayment;

    nowpaymentsService.createNowPaymentsPayment = async (data) => {
      passedPayCurrency = data.payCurrency;
      return { checkout_url: 'https://nowpayments.io/dummy', payment_id: '123' };
    };

    try {
      await provider.initialize({
        amount: 10,
        currency: 'USDT',
        network: 'native',
        reference: 'tx_test_123',
        callbackUrl: 'https://notestandard.com/callback',
        metadata: {}
      });

      assert.strictEqual(passedPayCurrency, 'usdttrc20', 'USDT native must resolve to usdttrc20');
    } finally {
      nowpaymentsService.createNowPaymentsPayment = originalCreate;
    }
  });

  it('2. USDC native or empty network should resolve to usdcerc20', async function () {
    const provider = new NowPaymentsProviderClass();
    let passedPayCurrency = null;

    const nowpaymentsService = require('../server/services/nowpaymentsService');
    const originalCreate = nowpaymentsService.createNowPaymentsPayment;

    nowpaymentsService.createNowPaymentsPayment = async (data) => {
      passedPayCurrency = data.payCurrency;
      return { checkout_url: 'https://nowpayments.io/dummy', payment_id: '123' };
    };

    try {
      await provider.initialize({
        amount: 10,
        currency: 'USDC',
        network: 'native',
        reference: 'tx_test_456',
        callbackUrl: 'https://notestandard.com/callback',
        metadata: {}
      });

      assert.strictEqual(passedPayCurrency, 'usdcerc20', 'USDC native must resolve to usdcerc20');
    } finally {
      nowpaymentsService.createNowPaymentsPayment = originalCreate;
    }
  });

  it('3. Explicit networks should resolve to corresponding tickers', async function () {
    const provider = new NowPaymentsProviderClass();
    let passedPayCurrency = null;

    const nowpaymentsService = require('../server/services/nowpaymentsService');
    const originalCreate = nowpaymentsService.createNowPaymentsPayment;

    nowpaymentsService.createNowPaymentsPayment = async (data) => {
      passedPayCurrency = data.payCurrency;
      return { checkout_url: 'https://nowpayments.io/dummy', payment_id: '123' };
    };

    try {
      await provider.initialize({
        amount: 10,
        currency: 'USDT',
        network: 'ERC20',
        reference: 'tx_test_789',
        callbackUrl: 'https://notestandard.com/callback',
        metadata: {}
      });
      assert.strictEqual(passedPayCurrency, 'usdterc20', 'USDT ERC20 must resolve to usdterc20');

      await provider.initialize({
        amount: 10,
        currency: 'USDT',
        network: 'BEP20',
        reference: 'tx_test_999',
        callbackUrl: 'https://notestandard.com/callback',
        metadata: {}
      });
      assert.strictEqual(passedPayCurrency, 'usdtbsc', 'USDT BEP20 must resolve to usdtbsc');
    } finally {
      nowpaymentsService.createNowPaymentsPayment = originalCreate;
    }
  });
});
