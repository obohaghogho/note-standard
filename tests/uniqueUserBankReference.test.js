'use strict';

/**
 * tests/uniqueUserBankReference.test.js
 * =====================================
 * Mocha test suite verifying:
 * 1. Persistent unique user bank references (NS-XXXXXXX) per user & provider.
 * 2. Reference reuse across multiple deposit calls.
 * 3. Unified single API response structure from Grey banking provider.
 * 4. Dynamic environment loading of bank details (address, holder, routings).
 */

const assert = require('assert');
const UserBankReferenceService = require('../server/services/payment/UserBankReferenceService');
const GreyBankingProvider = require('../server/services/settlement/GreyBankingProvider');

describe('Enterprise Grey USD Persistent Reference & Banking API', function () {
  this.timeout(10000);

  const testUserId1 = '00000000-0000-4000-a000-000000000001';
  const testUserId2 = '00000000-0000-4000-a000-000000000002';

  it('1. Should generate a persistent reference in NS-XXXXXXX format', async function () {
    const ref = await UserBankReferenceService.getOrCreateUserReference(testUserId1, 'grey');
    assert.ok(typeof ref === 'string', 'Reference should be string');
    assert.ok(ref.startsWith('NS-'), `Reference '${ref}' should start with NS-`);
    assert.strictEqual(ref.length, 10, `Reference '${ref}' should be 10 characters long (NS- + 7 chars)`);
  });

  it('2. Should reuse identical reference for subsequent requests (Persistence)', async function () {
    const ref1 = await UserBankReferenceService.getOrCreateUserReference(testUserId1, 'grey');
    const ref2 = await UserBankReferenceService.getOrCreateUserReference(testUserId1, 'grey');
    assert.strictEqual(ref1, ref2, 'Subsequent requests for same user must return identical reference');
  });

  it('3. Should generate different references for different users', async function () {
    const refUser1 = await UserBankReferenceService.getOrCreateUserReference(testUserId1, 'grey');
    const refUser2 = await UserBankReferenceService.getOrCreateUserReference(testUserId2, 'grey');
    assert.notStrictEqual(refUser1, refUser2, 'Different users must get distinct references');
  });

  it('4. Should allow explicit reference regeneration when requested', async function () {
    const originalRef = await UserBankReferenceService.getOrCreateUserReference(testUserId1, 'grey');
    const regeneratedRef = await UserBankReferenceService.regenerateUserReference(testUserId1, 'grey');
    assert.notStrictEqual(originalRef, regeneratedRef, 'Regenerated reference should differ from original');

    // Subsequent call should now return the regenerated reference
    const currentActiveRef = await UserBankReferenceService.getOrCreateUserReference(testUserId1, 'grey');
    assert.strictEqual(currentActiveRef, regeneratedRef, 'Active reference must be the regenerated one');
  });

  it('5. Should return single unified API response structure from GreyBankingProvider', async function () {
    const greyProvider = new GreyBankingProvider();
    const instructions = await greyProvider.createDepositInstructions({
      currency: 'USD',
      rail: 'ACH',
      userId: testUserId1
    });

    assert.ok(instructions, 'Instructions should be returned');
    assert.strictEqual(instructions.provider.name, 'GREY');
    assert.strictEqual(instructions.provider.bank_partner, 'Lead Bank');
    assert.strictEqual(instructions.account.holder, 'JOSSY DIGITAL TECHNOLOGIES LTD');
    assert.strictEqual(instructions.account.number, '217394889898');
    assert.strictEqual(instructions.account.type, 'Checking');
    assert.strictEqual(instructions.account.ach_routing, '101019644');
    assert.strictEqual(instructions.account.wire_routing, '101019644');
    assert.ok(instructions.account.address.includes('Kansas City'), 'Address must contain Kansas City');
    assert.strictEqual(instructions.reference.persistent, true);
    assert.ok(instructions.reference.code.startsWith('NS-'));
    assert.strictEqual(instructions.supported.ach, true);
    assert.strictEqual(instructions.supported.wire, true);
    assert.strictEqual(instructions.supported.swift, false);
    assert.strictEqual(instructions.fees.ach, 2.00);
    assert.strictEqual(instructions.fees.wire, 15.00);
  });
});
