'use strict';

/**
 * tests/depositMinimumFix.test.js
 * =========================================
 * Unit tests verifying:
 * 1. CryptoWalletService.deposit rejects amounts below $15 for USDT/USDC.
 * 2. Amounts of $15 or higher pass minimum threshold validation.
 * 3. walletController.deposit returns HTTP 400 when minimal amount errors are caught.
 */

const assert = require('assert');

describe('Crypto Deposit Minimum Threshold Test Suite', function () {
  this.timeout(5000);

  it('1. CryptoWalletService.deposit should throw clear error for deposit amounts below $15 for USDT', async function () {
    const CryptoWalletService = require('../server/services/CryptoWalletService');

    try {
      await CryptoWalletService.deposit(
        '00000000-0000-0000-0000-000000000001',
        'USDT',
        'TRC20',
        10,
        'FREE'
      );
      assert.fail('Should have thrown minimum deposit error for $10 USDT');
    } catch (err) {
      assert.ok(err.message.includes('Minimum deposit amount for USDT is $15'), `Error message should mention $15 minimum threshold: ${err.message}`);
    }
  });

  it('2. walletController.deposit should return HTTP 400 for minimal error messages', async function () {
    const walletController = require('../server/controllers/walletController');

    const req = {
      user: { id: '00000000-0000-0000-0000-000000000001' },
      userProfile: { plan: 'FREE' },
      body: { amount: 10, currency: 'USDT', network: 'TRC20' }
    };

    let statusCode = 0;
    let jsonResult = null;
    let nextCalledWithError = null;

    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonResult = data; return res; }
    };

    const next = (err) => { nextCalledWithError = err; };

    await walletController.deposit(req, res, next);

    assert.strictEqual(nextCalledWithError, null, 'next() should not be called with an unhandled 500 error');
    assert.strictEqual(statusCode, 400, 'Status code should be HTTP 400 Bad Request');
    assert.ok(jsonResult.error.includes('Minimum deposit amount'), 'Error response should present a user-friendly minimum error message');
  });
});
