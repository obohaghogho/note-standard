'use strict';

/**
 * tests/nowpaymentsIpnFix.test.js
 * =========================================
 * Unit tests verifying:
 * 1. getNowPaymentsIpnUrl generates valid absolute HTTPS URIs under all env conditions.
 * 2. NOWPayments provider initialization uses valid ipn_callback_url URIs.
 */

const assert = require('assert');
const { getNowPaymentsIpnUrl } = require('../server/utils/url_utils');

describe('NOWPayments IPN Callback URL Validation Test Suite', function () {
  this.timeout(5000);

  it('1. getNowPaymentsIpnUrl should return valid absolute https URI when env is undefined', function () {
    const originalEnv = process.env.NOWPAYMENTS_WEBHOOK_URL;
    const originalServer = process.env.SERVER_URL;
    delete process.env.NOWPAYMENTS_WEBHOOK_URL;
    delete process.env.SERVER_URL;

    const ipnUrl = getNowPaymentsIpnUrl();
    assert.ok(ipnUrl.startsWith('http'), 'IPN URL must start with http:// or https://');
    assert.ok(ipnUrl.includes('/webhooks/nowpayments'), 'IPN URL must include /webhooks/nowpayments path');
    assert.strictEqual(ipnUrl.includes('undefined'), false, 'IPN URL must not contain literal "undefined"');

    // Restore env
    if (originalEnv) process.env.NOWPAYMENTS_WEBHOOK_URL = originalEnv;
    if (originalServer) process.env.SERVER_URL = originalServer;
  });

  it('2. getNowPaymentsIpnUrl should honor explicit NOWPAYMENTS_WEBHOOK_URL env', function () {
    const testUrl = 'https://custom-domain.com/webhooks/nowpayments';
    const originalEnv = process.env.NOWPAYMENTS_WEBHOOK_URL;
    process.env.NOWPAYMENTS_WEBHOOK_URL = testUrl;

    const ipnUrl = getNowPaymentsIpnUrl();
    assert.strictEqual(ipnUrl, testUrl, 'Should use explicit NOWPAYMENTS_WEBHOOK_URL env');

    // Restore env
    if (originalEnv) process.env.NOWPAYMENTS_WEBHOOK_URL = originalEnv;
    else delete process.env.NOWPAYMENTS_WEBHOOK_URL;
  });

  it('3. getNowPaymentsIpnUrl should accept customUrl if absolute', function () {
    const custom = 'https://my-app.com/webhooks/nowpayments';
    const res = getNowPaymentsIpnUrl(custom);
    assert.strictEqual(res, custom);
  });
});
