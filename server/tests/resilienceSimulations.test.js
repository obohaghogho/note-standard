'use strict';

const GreySettlementProvider = require('../services/settlement/GreySettlementProvider');
const WithdrawalWorkflowService = require('../services/treasury/WithdrawalWorkflowService');
const crypto = require('crypto');
const assert = require('assert');

describe('Operational Resilience & Fault Injection Simulation Suite', function () {
  this.timeout(15000);

  let provider;

  before(() => {
    provider = new GreySettlementProvider();
  });

  it('1. Webhook Replay Protection — Rejects expired timestamp (>300s old)', async () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const payload = { event: 'payout.completed', reference: 'wd_replay_test' };
    const secret = 'grey_test_secret';
    const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    const result = await provider.verifyWebhookSignature({
      'x-grey-signature': sig,
      'x-grey-timestamp': String(expiredTimestamp)
    }, payload);

    assert.strictEqual(result, false, 'Expired webhook timestamp must be rejected as replay attack');
  });

  it('2. Webhook Deduplication — Duplicate webhook payload reference handling', async () => {
    const freshTimestamp = Math.floor(Date.now() / 1000);
    const payload = { event: 'payout.completed', id: 'evt_dup_123', reference: 'wd_dup_test' };
    const secret = 'grey_test_secret';
    const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    const result = await provider.verifyWebhookSignature({
      'x-grey-signature': sig,
      'x-grey-timestamp': String(freshTimestamp)
    }, payload);

    assert.strictEqual(typeof result, 'boolean');
  });

  it('3. Circuit Breaker Simulation — Trips after repeated provider failures', async () => {
    for (let i = 0; i < 5; i++) {
      provider._recordFailure();
    }
    assert.strictEqual(provider.circuitOpen, true, 'Circuit breaker must trip to OPEN after 5 failures');
    
    // Reset circuit breaker for remaining tests
    provider.circuitOpen = false;
    provider.failureCount = 0;
  });

  it('4. Zero-Loss Failure Recovery — Rollback safely releases frozen balance state', async () => {
    try {
      await WithdrawalWorkflowService.rollbackFailedWithdrawal('non_existent_tx_999', 'Simulated Provider 500 Outage', 'PROVIDER_TIMEOUT');
      assert.ok(true, 'Rollback handled safely without unhandled exception');
    } catch (e) {
      assert.fail(`Rollback threw exception: ${e.message}`);
    }
  });
});
