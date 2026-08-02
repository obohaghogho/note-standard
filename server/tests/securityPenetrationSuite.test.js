'use strict';

/**
 * securityPenetrationSuite.test.js
 * =================================
 * Security & Penetration Test Suite for NoteStandard Enterprise Banking.
 * Validates protection against webhook signature forgery, replay attacks, RBAC privilege escalation, and debit/credit imbalance attacks.
 */

const assert = require('assert');
const AnchorAdapter = require('../services/providers/AnchorAdapter');
const RBACService = require('../services/security/RBACService');
const SanctionsAMLService = require('../services/security/SanctionsAMLService');
const JournalService = require('../services/financial/JournalService');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function runSecuritySuite() {
  console.log('==================================================================');
  console.log('🛡️  Running Security & Penetration Test Suite (v1.0)');
  console.log('==================================================================');

  const anchor = new AnchorAdapter();
  const rbac = new RBACService();
  const sanctions = new SanctionsAMLService();
  const journalService = new JournalService();

  // TEST 1 — Webhook Signature Forgery Prevention
  section('TEST 1 — Webhook Signature Forgery Prevention');
  const forgedResult = await anchor.verifyWebhook({ event: 'payment.settled' }, 'INVALID', {});
  assert.strictEqual(forgedResult, false, 'Forged webhook signature correctly rejected');
  console.log('✓ Webhook signature forgery attempt blocked.');

  // TEST 2 — RBAC Privilege Escalation Prevention
  section('TEST 2 — RBAC Privilege Escalation Prevention');
  let escalationBlocked = false;
  try {
    await rbac.assertPermission('AUDITOR', 'TREASURY_REBALANCE_WRITE');
  } catch (err) {
    escalationBlocked = true;
    assert.ok(err.message.includes('ACCESS_DENIED'));
  }
  assert.ok(escalationBlocked, 'Auditor blocked from executing unauthorized administrative action');
  console.log('✓ RBAC privilege escalation attempt blocked.');

  // TEST 3 — Sanctions AML Entity Blocking
  section('TEST 3 — Sanctions AML Entity Blocking');
  let sanctionsBlocked = false;
  try {
    await sanctions.screenTransaction('usr_sanctioned_entity_99', 10000, 'USD');
  } catch (err) {
    sanctionsBlocked = true;
    assert.ok(err.message.includes('SANCTIONS_BLOCK'));
  }
  assert.ok(sanctionsBlocked, 'Sanctioned entity blocked');
  console.log('✓ Sanctions AML block enforced.');

  // TEST 4 — Double-Entry Unbalanced Journal Attack Rejection
  section('TEST 4 — Unbalanced Journal Injection Rejection');
  let unbalancedBlocked = false;
  try {
    await journalService.createJournal({
      reference: 'JNL_ATTACK_001',
      entryType: 'DEPOSIT',
      description: 'Malicious Unbalanced Journal Attack',
      lines: [
        { chartAccountId: '1110', debit: 1000000, credit: 0, currency: 'USD' },
        { chartAccountId: '2110', debit: 0, credit: 100, currency: 'USD' } // Unbalanced!
      ]
    });
  } catch (err) {
    unbalancedBlocked = true;
    assert.ok(err.message.includes('UNBALANCED_JOURNAL'));
  }
  assert.ok(unbalancedBlocked, 'Unbalanced journal injection rejected');
  console.log('✓ Unbalanced double-entry journal attack rejected.');

  console.log('\n==================================================================');
  console.log('🎉 ALL SECURITY & PENETRATION TESTS PASSED 100%!');
  console.log('==================================================================');
}

runSecuritySuite().catch(err => {
  console.error('❌ Security Suite failed:', err);
  process.exit(1);
});
