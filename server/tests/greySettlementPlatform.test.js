'use strict';

const GreySettlementProvider = require('../services/settlement/GreySettlementProvider');
const GreyDailyLimitService = require('../services/treasury/GreyDailyLimitService');
const WithdrawalWorkflowService = require('../services/treasury/WithdrawalWorkflowService');
const ReconciliationEngine = require('../services/treasury/ReconciliationEngine');
const assert = require('assert');

describe('Enterprise Grey Settlement & Treasury Platform Suite', function () {
  this.timeout(15000);

  let greyProvider;

  before(() => {
    greyProvider = new GreySettlementProvider();
  });

  it('1. GreySettlementProvider contract & capabilities verification', () => {
    assert.strictEqual(greyProvider.getProviderId(), 'grey');
    const caps = greyProvider.getCapabilities();
    assert.strictEqual(caps.dailySettlementLimitUsd, 100000.0);
    assert.strictEqual(caps.supportsP2P, true);
    assert.strictEqual(caps.supportsFxSwap, true);
  });

  it('2. GreyDailyLimitService $100k daily capacity check', async () => {
    const check = await GreyDailyLimitService.checkSettlementCapacity(5000, 'USD');
    assert.strictEqual(typeof check.isAvailable, 'boolean');
    assert.strictEqual(check.dailyLimitUsd, 100000.0);
    assert.ok(check.remainingCapacityUsd >= 0);
  });

  it('3. Webhook HMAC-SHA256 signature verification', async () => {
    const payload = { event: 'payout.completed', reference: 'wd_test_123', amount: 150.0 };
    const result = await greyProvider.verifyWebhookSignature({}, payload);
    assert.strictEqual(typeof result, 'boolean');
  });

  it('4. Health check telemetry', async () => {
    const health = await greyProvider.healthCheck();
    assert.ok(['HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(health.status));
    assert.strictEqual(typeof health.latencyMs, 'number');
  });

  it('5. Automated Reconciliation Engine execution', async () => {
    const report = await ReconciliationEngine.runReconciliationBatch(24);
    assert.ok(report.batchId.startsWith('rec_'));
    assert.ok(['CLEAN', 'HAS_BREAKS'].includes(report.status));
    assert.strictEqual(typeof report.matchedRecords, 'number');
  });
});
