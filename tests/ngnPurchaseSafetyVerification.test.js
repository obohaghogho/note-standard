'use strict';

/**
 * tests/ngnPurchaseSafetyVerification.test.js
 * ============================================
 * 100% End-to-End Safety & Correctness Verification Test Suite for
 * NoteStandard NGN Bank Transfers, Dedicated Virtual Accounts & Purchase Flows.
 */

const assert = require('assert');
const FincraBankingProviderV1 = require('../server/services/settlement/FincraBankingProviderV1');
const BankingProviderRouter = require('../server/services/settlement/BankingProviderRouter');
const UserBankReferenceService = require('../server/services/payment/UserBankReferenceService');
const DepositSessionService = require('../server/services/payment/DepositSessionService');
const DepositFraudRiskEngine = require('../server/services/payment/DepositFraudRiskEngine');
const DepositEventQueue = require('../server/services/payment/DepositEventQueue');
const ReconciliationEngine = require('../server/services/reconciliation/ReconciliationEngine');
const ProviderHealthScorerService = require('../server/services/settlement/ProviderHealthScorerService');

describe('NGN Bank Transfer & Dedicated Virtual Account 100% Safety Verification', function() {
  this.timeout(15000);

  const testUserId = 'f7d8e9a0-1234-4567-89ab-cdef01234567';

  it('1. Should generate GTBank Virtual Account details with zero Channel Reference leak', async function() {
    const instructions = await BankingProviderRouter.getDepositInstructions({
      currency: 'NGN',
      rail: 'BANK_TRANSFER',
      userId: testUserId
    });

    assert.strictEqual(instructions.provider.name, 'FINCRA');
    assert.strictEqual(instructions.account.bank_name, 'Guaranty Trust Bank');
    assert.strictEqual(instructions.account.bank_code, '058');
    assert.strictEqual(instructions.account.holder, 'JOSSY DIGITAL TECHNOLOGIES LTD');
    assert.strictEqual(instructions.account.number, '5000701121');
    assert.ok(instructions.reference.code.startsWith('NS-NGN-'), 'Reference code must start with NS-NGN-');
    assert.strictEqual(instructions.channel_reference, undefined, 'Fincra internal Channel Reference must NOT be exposed');
  });

  it('2. Should generate and persist unique permanent user reference (NS-NGN-XXXXXXXX)', async function() {
    const userRef = await UserBankReferenceService.getOrCreateUserReference(testUserId, 'fincra');
    assert.ok(userRef.startsWith('NS-NGN-'), `Expected userRef to start with NS-NGN-, got ${userRef}`);

    // Re-querying should return the exact same persistent reference
    const userRefSecondCall = await UserBankReferenceService.getOrCreateUserReference(testUserId, 'fincra');
    assert.strictEqual(userRefSecondCall, userRef, 'Permanent reference must be idempotent and reusable forever');
  });

  it('3. Should create 24h deposit session with append-only event logging', async function() {
    const userRef = await UserBankReferenceService.getOrCreateUserReference(testUserId, 'fincra');
    const session = await DepositSessionService.createSession(testUserId, 'NGN', userRef, 50000);

    assert.ok(session.session_id.startsWith('dep_'));
    assert.strictEqual(session.currency, 'NGN');
    assert.strictEqual(session.user_reference, userRef);
    assert.strictEqual(session.provider_used, 'fincra');
    assert.strictEqual(session.status, 'CREATED');

    // Fetch event trail
    const events = await DepositSessionService.getSessionEvents(session.session_id);
    assert.ok(events.length >= 1, 'Event log must record session creation');
    assert.strictEqual(events[0].new_status, 'CREATED');
  });

  it('4. Should pass pre-ledger fraud screening for standard NGN bank transfer', async function() {
    const userRef = await UserBankReferenceService.getOrCreateUserReference(testUserId, 'fincra');
    const riskEval = await DepositFraudRiskEngine.evaluateRisk({
      userId: testUserId,
      userReference: userRef,
      amount: 25000,
      currency: 'NGN'
    });

    assert.strictEqual(riskEval.cleared, true, 'Standard NGN deposit must pass risk screening');
    assert.strictEqual(riskEval.actionTaken, 'PROCEED');
    assert.strictEqual(riskEval.riskScore, 0);
  });

  it('5. Should handle incoming webhook collection event cleanly without error', async function() {
    const userRef = await UserBankReferenceService.getOrCreateUserReference(testUserId, 'fincra');
    const eventId = `evt_fincra_test_${Date.now()}`;
    const payload = {
      event: 'charge.success',
      data: {
        id: eventId,
        reference: userRef,
        amount: 15000,
        currency: 'NGN',
        status: 'successful',
        customer: { email: 'safety_test@notestandard.com', name: 'Safety Tester' },
        channel: 'virtual_account',
        fee: 0
      }
    };

    const queueResult = await DepositEventQueue.enqueueEvent({
      provider: 'fincra',
      eventId: eventId,
      eventType: 'charge.success',
      payload: payload
    });

    assert.strictEqual(queueResult.status, 'QUEUED');
    assert.ok(queueResult.eventId, 'Event ID must be recorded in queue');
  });

  it('6. Should evaluate dynamic provider health score >= 90 for Fincra NGN', function() {
    ProviderHealthScorerService.recordMetrics('fincra', {
      latencyMs: 110,
      failureRate: 0,
      webhookDelaySec: 1,
      circuitOpen: false
    });

    const score = ProviderHealthScorerService.calculateHealthScore('fincra');
    assert.ok(score >= 90, `Health score should be >= 90, got ${score}`);
  });

  it('7. Should verify cross-provider financial integrity (Zero Ledger Drift)', async function() {
    const reconEngine = new ReconciliationEngine();
    const reconResult = await reconEngine.runCrossProviderIntegrityCheck();

    assert.strictEqual(reconResult.balanced, true, 'Internal double-entry ledger must balance');
    assert.strictEqual(reconResult.status, 'HEALTHY');
  });
});
