/**
 * Fincra NGN Bank Transfer & Virtual Dedicated Account End-to-End Safety Test
 */
const assert = require('assert');
const BankingProviderRouter = require('../server/services/settlement/BankingProviderRouter');
const UserBankReferenceService = require('../server/services/payment/UserBankReferenceService');
const DepositSessionService = require('../server/services/payment/DepositSessionService');
const DepositEventQueue = require('../server/services/payment/DepositEventQueue');
const DepositFraudRiskEngine = require('../server/services/payment/DepositFraudRiskEngine');

describe('Fincra NGN Virtual Dedicated Account & Bank Transfer Safety Test Suite', function () {
  this.timeout(15000);

  const testUserId = 'f7d24a91-1234-4567-89ab-cdef01234567';

  it('1. Should generate GTBank NGN instructions with 0 channel reference leakage', async function () {
    const instructions = await BankingProviderRouter.getDepositInstructions({
      currency: 'NGN',
      rail: 'BANK_TRANSFER',
      userId: testUserId
    });

    assert.strictEqual(instructions.provider.name, 'FINCRA');
    assert.strictEqual(instructions.account.bank_name, 'Guaranty Trust Bank');
    assert.strictEqual(instructions.account.bank_code, '058');
    assert.strictEqual(instructions.account.number, '5000701121');
    assert.strictEqual(instructions.account.holder, 'JOSSY DIGITAL TECHNOLOGIES LTD');
    assert.match(instructions.reference.code, /^NS-NGN-[A-Z0-9]{8}$/);

    // Strict Privacy Verification: Ensure internal channel reference is NOT exposed
    const stringified = JSON.stringify(instructions);
    assert.strictEqual(stringified.includes('fcb907bd'), false, 'Channel reference leaked into public instructions!');
  });

  it('2. Should create a valid 24h deposit session with append-only event logging', async function () {
    const session = await DepositSessionService.createSession({
      userId: testUserId,
      currency: 'NGN',
      userReference: 'NS-NGN-TEST1234',
      providerUsed: 'fincra'
    });

    assert.ok(session.session_id);
    assert.strictEqual(session.currency, 'NGN');
    assert.strictEqual(session.status, 'CREATED');

    const updatedSession = await DepositSessionService.transitionSession(
      session.session_id,
      'DETECTED',
      'fincra_webhook_received'
    );
    assert.strictEqual(updatedSession.status, 'DETECTED');
  });

  it('3. Should pass pre-ledger fraud screening for standard transfer amounts', async function () {
    const riskResult = await DepositFraudRiskEngine.screenDeposit({
      userId: testUserId,
      amount: 5000,
      currency: 'NGN',
      userReference: 'NS-NGN-TEST1234',
      providerTxId: 'fnc_tx_verify_9988'
    });

    assert.strictEqual(riskResult.cleared, true);
    assert.ok(riskResult.riskScore < 50);
  });

  it('4. Should process simulated Fincra deposit webhook without errors', async function () {
    const webhookPayload = {
      event: 'collection.successful',
      data: {
        id: 'fnc_tx_sim_' + Date.now(),
        reference: 'fcb907bd-ab39-4361-bc9b-4f5e94e400c2', // Internal Channel Ref
        customer: { name: 'Manuel Test', email: 'test@notestandard.com' },
        amount: 2500,
        currency: 'NGN',
        status: 'successful',
        narration: 'Transfer NS-NGN-TEST1234'
      }
    };

    const processResult = await DepositEventQueue.enqueueWebhookEvent({
      provider: 'fincra',
      eventId: 'evt_' + Date.now(),
      eventType: 'collection.successful',
      payload: webhookPayload
    });

    assert.strictEqual(processResult.success, true);
  });
});
