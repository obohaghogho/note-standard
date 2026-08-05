'use strict';

const GreyBankingProvider = require('../services/settlement/GreyBankingProvider');
const BankingProviderRouter = require('../services/settlement/BankingProviderRouter');
const DepositInstructionService = require('../services/treasury/DepositInstructionService');
const DepositMatchingService = require('../services/treasury/DepositMatchingService');
const UnknownDepositService = require('../services/treasury/UnknownDepositService');
const assert = require('assert');

describe('Enterprise Grey Business Banking & Deposit Matching Integration Suite', function () {
  this.timeout(20000);

  let greyBanking;

  before(() => {
    greyBanking = new GreyBankingProvider();
  });

  it('1. GreyBankingProvider Capabilities Registry & Dynamic Instructions', async () => {
    const caps = greyBanking.getCapabilities();
    assert.strictEqual(caps.supportsACH, true);
    assert.strictEqual(caps.supportsWire, true);
    assert.strictEqual(caps.supportsSWIFT, false);

    const instructions = await DepositInstructionService.getDepositInstructions({ currency: 'USD', rail: 'ACH', userId: 'user_123' });
    assert.strictEqual(instructions.success, true);
    assert.strictEqual(instructions.data.bankName, 'Lead Bank');
    assert.ok(instructions.data.notices.length >= 3);
    assert.ok(instructions.data.notices.some(n => n.includes('SWIFT transfers are NOT supported')));
  });

  it('2. Confidence-Scored Deposit Matching Engine — Exact Match (>=95%)', async () => {
    const payload = {
      provider: 'grey',
      providerTxId: 'tx_ach_exact_1001',
      providerReference: 'ref_ach_1001',
      amount: 500.0,
      currency: 'USD',
      rail: 'ACH',
      senderName: 'John Doe',
      senderAccount: '8839201948',
      memo: 'NS-USER123 Deposit',
      fee: 2.50
    };

    const candidate = {
      id: 'dep_ref_1',
      reference: 'NS-USER123',
      user_id: 'd0a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
      account_number: '8839201948',
      expected_amount: 500.0,
      currency: 'USD',
      created_at: new Date().toISOString()
    };

    const score = DepositMatchingService._calculateConfidenceScore(payload, candidate);
    assert.ok(score >= 95, `Match score ${score}% must meet or exceed 95% threshold`);
  });

  it('3. Confidence-Scored Matching — Low Confidence (<70%) routes to Unknown Queue', async () => {
    const lowMatchPayload = {
      provider: 'grey',
      providerTxId: 'tx_ach_unknown_999',
      providerReference: 'ref_ach_999',
      amount: 125.0,
      currency: 'USD',
      rail: 'ACH',
      senderName: 'Unknown Depositor',
      senderAccount: '9999999999',
      memo: 'Random wire deposit'
    };

    const result = await DepositMatchingService.matchAndProcessDeposit(lowMatchPayload);
    assert.strictEqual(result.status, 'UNALLOCATED');
    assert.strictEqual(result.confidenceScore, 0);
  });

  it('4. Duplicate Deposit Prevention — 0 Double Credit Guarantee', async () => {
    const dupPayload = {
      provider: 'grey',
      providerTxId: 'tx_dup_test_888',
      providerReference: 'ref_dup_888',
      amount: 250.0,
      currency: 'USD',
      rail: 'ACH',
      memo: 'NS-TEST'
    };

    // First attempt
    await DepositMatchingService.matchAndProcessDeposit(dupPayload);
    // Second duplicate attempt
    const dupResult = await DepositMatchingService.matchAndProcessDeposit(dupPayload);

    assert.strictEqual(dupResult.status, 'DUPLICATE');
  });

  it('5. Admin Unallocated Queue Resolution', async () => {
    const reviews = await UnknownDepositService.getPendingReviews();
    assert.strictEqual(Array.isArray(reviews), true);
  });
});
