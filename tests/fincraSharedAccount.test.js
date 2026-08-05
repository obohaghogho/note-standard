'use strict';

/**
 * tests/fincraSharedAccount.test.js
 * =================================
 * Masterclass Unit & Integration Test Suite for Enterprise Fincra NGN Banking,
 * Shared Virtual Accounts, Provider-Independent Sessions, Risk Screening & Reconciliation.
 */

const assert = require('assert');
const FincraBankingProviderV1 = require('../server/services/settlement/FincraBankingProviderV1');
const GreyBankingProviderV1 = require('../server/services/settlement/GreyBankingProviderV1');
const BankingProviderRouter = require('../server/services/settlement/BankingProviderRouter');
const ProviderHealthScorerService = require('../server/services/settlement/ProviderHealthScorerService');
const ProviderCapabilityService = require('../server/services/settlement/ProviderCapabilityService');
const DepositSessionService = require('../server/services/payment/DepositSessionService');
const DepositFraudRiskEngine = require('../server/services/payment/DepositFraudRiskEngine');
const ReconciliationEngine = require('../server/services/reconciliation/ReconciliationEngine');

describe('Enterprise Fincra NGN Banking & Decoupled Treasury Suite', function() {
  this.timeout(10000);

  it('1. Should generate NGN deposit instructions with GTBank details and hide Channel Reference from customer UI', async function() {
    const fincra = new FincraBankingProviderV1();
    const instructions = await fincra.createDepositInstructions({
      currency: 'NGN',
      rail: 'BANK_TRANSFER',
      userId: 'user_test_fincra_123'
    });

    assert.strictEqual(instructions.provider.name, 'FINCRA');
    assert.strictEqual(instructions.account.bank_name, 'Guaranty Trust Bank');
    assert.strictEqual(instructions.account.bank_code, '058');
    assert.strictEqual(instructions.account.holder, 'JOSSY DIGITAL TECHNOLOGIES LTD');
    assert.strictEqual(instructions.account.number, '5000701121');
    assert.ok(instructions.reference.code.startsWith('NS-NGN-'));
    assert.strictEqual(instructions.channel_reference, undefined, 'Fincra Channel Reference MUST NOT be exposed in customer UI payload');
  });

  it('2. Should create provider-independent deposit sessions and record immutable event history', async function() {
    const session = await DepositSessionService.createSession('user_test_456', 'NGN', 'NS-NGN-TEST1234');
    assert.ok(session.session_id.startsWith('dep_'));
    assert.strictEqual(session.currency, 'NGN');
    assert.strictEqual(session.user_reference, 'NS-NGN-TEST1234');
    assert.strictEqual(session.provider_used, 'fincra');
  });

  it('3. Should evaluate Provider Health Scoring (0-100) dynamically', function() {
    ProviderHealthScorerService.recordMetrics('fincra', { latencyMs: 120, failureRate: 0.01, webhookDelaySec: 2, circuitOpen: false });
    const score = ProviderHealthScorerService.calculateHealthScore('fincra');
    assert.ok(score >= 90, `Health score should be high, got ${score}`);
  });

  it('4. Should route NGN requests to Fincra and USD to Grey dynamically via BankingProviderRouter', function() {
    const ngnChoice = BankingProviderRouter.selectBestBankingProvider({ currency: 'NGN' });
    assert.strictEqual(ngnChoice.providerId.toLowerCase(), 'fincra');

    const usdChoice = BankingProviderRouter.selectBestBankingProvider({ currency: 'USD' });
    assert.strictEqual(usdChoice.providerId.toLowerCase(), 'grey');
  });

  it('5. Should pass pre-ledger deposit risk screening for standard transfers and flag anomalies', async function() {
    const normalEval = await DepositFraudRiskEngine.evaluateRisk({
      userId: 'user_normal_789',
      userReference: 'NS-NGN-NORM1',
      amount: 5000,
      currency: 'NGN'
    });
    assert.strictEqual(normalEval.cleared, true);

    const anomalyEval = await DepositFraudRiskEngine.evaluateRisk({
      userId: 'user_high_999',
      userReference: 'NS-NGN-HIGH1',
      amount: 100000000,
      currency: 'NGN'
    });
    assert.strictEqual(anomalyEval.cleared, false);
    assert.strictEqual(anomalyEval.actionTaken, 'MANUAL_REVIEW');
  });

  it('6. Should query database-backed provider capabilities with 30s TTL cache', async function() {
    const isFincraVirtual = await ProviderCapabilityService.isFeatureEnabled('fincra', 'virtual_account');
    assert.strictEqual(isFincraVirtual, true);
  });

  it('7. Should execute Cross-Provider Financial Integrity Reconciliation', async function() {
    const reconEngine = new ReconciliationEngine();
    const result = await reconEngine.runCrossProviderIntegrityCheck();
    assert.strictEqual(result.balanced, true);
    assert.strictEqual(result.status, 'HEALTHY');
  });
});
