require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const CryptoRiskEngine = require('../services/risk/CryptoRiskEngine');
const CryptoLedgerService = require('../services/CryptoLedgerService');
const pool = require('../config/pgPool');
const assert = require('assert');

async function testPhase4Gate() {
  console.log("=== [PHASE 4 VERIFICATION GATE] Testing CryptoRiskEngine & Multi-Sig Approvals ===");

  try {
    const profilesRes = await pool.query(`SELECT id FROM public.profiles LIMIT 3`);
    let userA, admin1, admin2;
    if (profilesRes.rows.length >= 3) {
      userA = profilesRes.rows[0].id;
      admin1 = profilesRes.rows[1].id;
      admin2 = profilesRes.rows[2].id;
    } else {
      userA = profilesRes.rows[0].id;
      admin1 = profilesRes.rows[0].id;
      admin2 = profilesRes.rows[0].id;
    }

    console.log(`Using Test IDs: User = ${userA}, Admin1 = ${admin1}, Admin2 = ${admin2}`);

    await CryptoLedgerService.getOrCreateWallet(userA, 'USDT');

    // Test 1: Dynamic Risk Evaluation Tiers
    console.log("\n[Test 1] Testing Risk Evaluation Tiers...");
    const lowRisk = await CryptoRiskEngine.evaluateWithdrawal({ userId: userA, currency: 'USDT', amount: 500 });
    assert.strictEqual(lowRisk.requiredApprovals, 0);
    assert.strictEqual(lowRisk.approvalStatus, 'NOT_REQUIRED');
    console.log("✓ $500 Withdrawal Evaluated -> Auto Low (0 approvals)");

    const midRisk = await CryptoRiskEngine.evaluateWithdrawal({ userId: userA, currency: 'USDT', amount: 5000 });
    assert.strictEqual(midRisk.requiredApprovals, 1);
    assert.strictEqual(midRisk.approvalStatus, 'PENDING_APPROVAL');
    console.log("✓ $5,000 Withdrawal Evaluated -> Single Admin Approval (1 approval)");

    const highRisk = await CryptoRiskEngine.evaluateWithdrawal({ userId: userA, currency: 'USDT', amount: 50000 });
    assert.strictEqual(highRisk.requiredApprovals, 2);
    assert.strictEqual(highRisk.approvalStatus, 'PENDING_APPROVAL');
    console.log("✓ $50,000 Withdrawal Evaluated -> Multi-Sig Dual Admin (2 approvals)");

    // Test 2: Multi-Signature Approval Workflow
    console.log("\n[Test 2] Testing Dual Admin Multi-Sig Approval Workflow...");
    // Credit funds and lock for $50,000 test
    await CryptoLedgerService.creditDeposit({ userId: userA, currency: 'USDT', amount: 100000, txHash: '0xrisktest' });
    
    const lockRes = await CryptoLedgerService.lockFunds({ userId: userA, currency: 'USDT', amount: 50000, fee: 0 });
    const txId = lockRes.transaction.id;

    // Update transaction to require 2 approvals for testing
    await pool.query(`UPDATE public.crypto_transactions SET required_approvals = 2, approval_status = 'PENDING_APPROVAL' WHERE id = $1`, [txId]);

    // Admin 1 Approval
    console.log("-> Admin 1 submitting 1st approval...");
    const app1 = await CryptoRiskEngine.recordAdminApproval({ transactionId: txId, adminId: admin1, action: 'APPROVED', reason: 'Verified KYC' });
    assert.strictEqual(app1.currentApprovals, 1);
    assert.strictEqual(app1.transaction.approval_status, 'PENDING_APPROVAL'); // Needs 2!
    console.log("✓ Admin 1 approval recorded. Status remains PENDING_APPROVAL (1/2)");

    // Admin 2 Approval
    console.log("-> Admin 2 submitting 2nd approval...");
    const app2 = await CryptoRiskEngine.recordAdminApproval({ transactionId: txId, adminId: admin2, action: 'APPROVED', reason: 'Second signoff' });
    assert.strictEqual(app2.currentApprovals, 2);
    assert.strictEqual(app2.transaction.approval_status, 'APPROVED');
    assert.strictEqual(app2.transaction.status, 'PROCESSING');
    console.log("✓ Admin 2 approval recorded! Status escalated to APPROVED & PROCESSING (2/2)");

    // Test 3: Wallet State Transition & Risk Lockdown
    console.log("\n[Test 3] Testing Wallet State Transition & Risk Lockdown...");
    await CryptoRiskEngine.updateWalletState(userA, 'USDT', 'FROZEN', admin1, 'Suspicious IP activity');
    
    await assert.rejects(
      async () => {
        await CryptoRiskEngine.evaluateWithdrawal({ userId: userA, currency: 'USDT', amount: 100 });
      },
      /RISK_REJECT/,
      "Frozen wallet must reject withdrawal"
    );
    console.log("✓ Frozen wallet successfully rejected withdrawal request!");

    // Restore to ACTIVE
    await CryptoRiskEngine.updateWalletState(userA, 'USDT', 'ACTIVE', admin1, 'Investigation cleared');
    console.log("✓ Wallet state restored to ACTIVE.");

    console.log("\n============================================================");
    console.log("=== [PHASE 4 VERIFICATION GATE] PASSED 100% CLEANLY ===");
    console.log("============================================================");
  } catch (err) {
    console.error("❌ Phase 4 Gate FAILED:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testPhase4Gate();
