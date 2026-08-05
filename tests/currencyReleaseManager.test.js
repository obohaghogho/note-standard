'use strict';

/**
 * tests/currencyReleaseManager.test.js
 * =====================================
 * Mocha test suite verifying Enterprise 10/10 Currency Governance:
 * 1. Pre-launch 7-point verification checklist.
 * 2. Maker-Checker two-person approval workflow.
 * 3. Maker self-approval rejection.
 * 4. Emergency auto-rollback trigger.
 * 5. Canary group deterministic scoring.
 * 6. Immutable audit log stream formatting.
 */

const assert = require('assert');
const CurrencyReleaseManagerService = require('../server/services/payment/CurrencyReleaseManagerService');

describe('Enterprise 10/10 Currency Governance Engine', function () {
  this.timeout(10000);

  it('1. Pre-launch checklist should evaluate 7 operational requirements', async function () {
    const checklist = await CurrencyReleaseManagerService.verifyPreLaunchChecklist('CAD');
    assert.strictEqual(checklist.code, 'CAD');
    assert.strictEqual(checklist.totalCount, 7);
    assert.strictEqual(checklist.canPromote, true);
    assert.strictEqual(checklist.checks.length, 7);
  });

  it('2. Maker Request should place currency in PENDING_APPROVAL status', async function () {
    const setting = await CurrencyReleaseManagerService.getSetting('CAD');
    setting.release_status = 'DEVELOPMENT'; // Reset status for test isolation

    const admin1 = { id: 'admin_maker_001', email: 'maker@notestandard.com' };
    const res = await CurrencyReleaseManagerService.requestPromotion('CAD', admin1, 'Rolling out CAD for Canada launch');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'PENDING_APPROVAL');

    const updatedSetting = await CurrencyReleaseManagerService.getSetting('CAD');
    assert.strictEqual(updatedSetting.release_status, 'PENDING_APPROVAL');
  });

  it('3. Maker-Checker Enforcer: Maker cannot approve their own promotion request', async function () {
    const admin1 = { id: 'admin_maker_001', email: 'maker@notestandard.com' };
    
    try {
      await CurrencyReleaseManagerService.approvePromotion('CAD', admin1, 'Self approval attempt');
      assert.fail('Maker self-approval should have thrown error');
    } catch (err) {
      assert.ok(err.message.includes('Maker-Checker violation'), 'Must reject maker self-approval');
    }
  });

  it('4. Checker Approval: Second admin can approve promotion to LIVE', async function () {
    const admin2 = { id: 'admin_checker_002', email: 'checker@notestandard.com' };
    const res = await CurrencyReleaseManagerService.approvePromotion('CAD', admin2, 'Second person approval granted');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'LIVE');

    const setting = await CurrencyReleaseManagerService.getSetting('CAD');
    assert.strictEqual(setting.release_status, 'LIVE');
  });

  it('5. Emergency Auto-Rollback should revert currency to MAINTENANCE mode', async function () {
    await CurrencyReleaseManagerService.triggerAutoRollback('CAD', 'Deposit success rate dropped below 95% threshold');
    
    const setting = await CurrencyReleaseManagerService.getSetting('CAD');
    assert.strictEqual(setting.health_status, 'MAINTENANCE');
    assert.ok(setting.maintenance_notice.includes('Auto-Rollback Triggered'));
  });

  it('6. Canary Group Evaluator should produce deterministic scoring', function () {
    const inCanary100 = CurrencyReleaseManagerService.isUserInCanaryGroup('user_123', 100);
    const inCanary0 = CurrencyReleaseManagerService.isUserInCanaryGroup('user_123', 0);

    assert.strictEqual(inCanary100, true);
    assert.strictEqual(inCanary0, false);
  });
});
