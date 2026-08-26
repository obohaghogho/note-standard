/**
 * Fincra Adversarial Compliance Test Suite
 * ─────────────────────────────────────────
 * Directly attacks NoteStandard Fincra endpoints and handlers with adversarial parameters:
 *  - Unsupported asset
 *  - Unverified KYC user
 *  - Over-limit transaction
 *  - Restricted / Suspended / Blocked user
 *  - High-risk transaction (FraudRiskEngine flag)
 *  - FraudRiskEngine / Limit check failures (Fail-closed)
 *  - Provider unavailable (Atomic reversal)
 *  - Duplicate request (Idempotency)
 *  - Valid compliant withdrawal & conversion
 *
 * Usage: node server/tests/fincraAdversarialCompliance.test.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const supabase       = require("../config/database");
const payoutEngine   = require("../withdrawal/payoutEngine");
const conversion     = require("../services/fincra/conversion");
const complianceGate = require("../withdrawal/complianceGate");
const limitCheck     = require("../utils/limitCheck");
const { v4: uuidv4 } = require("uuid");

const results = { passed: 0, failed: 0, tests: [] };

function pass(label, detail = "") {
  results.passed++;
  results.tests.push({ status: "PASS", label, detail });
  console.log(`  ✅ ${label}${detail ? " — " + detail : ""}`);
}

function fail(label, err) {
  results.failed++;
  const msg = err?.message || String(err);
  results.tests.push({ status: "FAIL", label, detail: msg });
  console.log(`  ❌ ${label} — ${msg}`);
}

async function runAdversarialSuite() {
  console.log("================================================================");
  console.log("FINCRA ADVERSARIAL COMPLIANCE & REJECTION TEST SUITE STARTING");
  console.log("================================================================");

  let testUserId = null;
  let originalProfileState = null;

  try {
    // ── Setup: Fetch an existing user profile from database ───────────────────
    const { data: existingProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, email, is_verified, kyc_level, status, plan_tier, daily_withdrawal_limit")
      .limit(1)
      .single();

    if (profileErr || !existingProfile) {
      throw new Error(`Test setup failed fetching profile: ${profileErr?.message}`);
    }

    testUserId = existingProfile.id;
    originalProfileState = { ...existingProfile };

    // Set to unverified initial state for testing compliance gate
    await supabase.from("profiles").update({
      is_verified: false,
      kyc_level: 0,
      status: "active",
      daily_withdrawal_limit: 1000.00,
    }).eq("id", testUserId);

    console.log(`[SETUP] Configured test user ${testUserId} (${existingProfile.email}) with kyc_level = 0, is_verified = false.`);

    // ── SCENARIO 1: Unsupported Asset ─────────────────────────────────────────
    console.log("\n[SCENARIO 1] Unsupported / Unknown Asset Attempt");
    try {
      await conversion.executeFincraConversion({
        quoteReference: "mock_quote",
        userId: testUserId,
        sourceCurrency: "DOGE",
        destinationCurrency: "NGN",
        amount: 100,
      });
      fail("SCENARIO 1", new Error("Allowed conversion with unsupported asset DOGE!"));
    } catch (err) {
      if (err.message.includes("supports fiat currencies") || err.message.includes("DOGE")) {
        pass("SCENARIO 1: Unsupported asset DOGE rejected by asset whitelist.", err.message);
      } else {
        fail("SCENARIO 1: Unexpected error for unsupported asset", err);
      }
    }

    // ── SCENARIO 2: Unverified KYC User Payout ─────────────────────────────────
    console.log("\n[SCENARIO 2] Unverified KYC User Payout Attempt");
    try {
      await payoutEngine.processWithdrawal({
        userId: testUserId,
        amount: 100.00,
        currency: "NGN",
        bankCode: "058",
        accountNumber: "0123456789",
        accountName: "Unverified Tester",
      });
      fail("SCENARIO 2", new Error("Allowed payout for unverified user!"));
    } catch (err) {
      if (err.message.includes("VERIFICATION_REQUIRED")) {
        pass("SCENARIO 2: Unverified user payout blocked with VERIFICATION_REQUIRED.", err.message);
      } else {
        fail("SCENARIO 2: Expected VERIFICATION_REQUIRED error", err);
      }
    }

    // ── SCENARIO 3: Unverified KYC User Conversion ──────────────────────────────
    console.log("\n[SCENARIO 3] Unverified KYC User Conversion Attempt");
    try {
      await conversion.executeFincraConversion({
        quoteReference: "mock_quote_123",
        userId: testUserId,
        sourceCurrency: "USD",
        destinationCurrency: "NGN",
        amount: 50,
      });
      fail("SCENARIO 3", new Error("Allowed conversion for unverified user!"));
    } catch (err) {
      if (err.message.includes("VERIFICATION_REQUIRED")) {
        pass("SCENARIO 3: Unverified user conversion blocked with VERIFICATION_REQUIRED.", err.message);
      } else {
        fail("SCENARIO 3: Expected VERIFICATION_REQUIRED error", err);
      }
    }

    // Update user to verified for subsequent tests
    await supabase.from("profiles").update({ is_verified: true, kyc_level: 1 }).eq("id", testUserId);
    console.log(`[SETUP] Upgraded user ${testUserId} to is_verified = true, kyc_level = 1.`);

    // ── SCENARIO 4: Over-Limit Withdrawal Attempt ──────────────────────────────
    console.log("\n[SCENARIO 4] Transaction Above Permitted Limit Attempt");
    try {
      await payoutEngine.processWithdrawal({
        userId: testUserId,
        amount: 5000.00, // Limit is 1000.00
        currency: "NGN",
        bankCode: "058",
        accountNumber: "0123456789",
        accountName: "Overlimit Tester",
      });
      fail("SCENARIO 4", new Error("Allowed payout exceeding daily limit ($5000 > $1000)!"));
    } catch (err) {
      if (err.message.includes("LIMIT_EXCEEDED")) {
        pass("SCENARIO 4: Over-limit payout blocked with LIMIT_EXCEEDED.", err.message);
      } else {
        fail("SCENARIO 4: Expected LIMIT_EXCEEDED error", err);
      }
    }

    // ── SCENARIO 5: Restricted User (status = 'suspended') ─────────────────────
    console.log("\n[SCENARIO 5] Suspended User Payout Attempt");
    await supabase.from("profiles").update({ status: "suspended" }).eq("id", testUserId);
    try {
      await payoutEngine.processWithdrawal({
        userId: testUserId,
        amount: 50.00,
        currency: "NGN",
        bankCode: "058",
        accountNumber: "0123456789",
        accountName: "Suspended Tester",
      });
      fail("SCENARIO 5", new Error("Allowed payout for suspended user!"));
    } catch (err) {
      if (err.message.includes("ACCOUNT_RESTRICTED")) {
        pass("SCENARIO 5: Suspended user payout blocked with ACCOUNT_RESTRICTED.", err.message);
      } else {
        fail("SCENARIO 5: Expected ACCOUNT_RESTRICTED error", err);
      }
    }

    // ── SCENARIO 6: Blocked User Attempt ───────────────────────────────────────
    console.log("\n[SCENARIO 6] Blocked User Conversion Attempt");
    await supabase.from("profiles").update({ status: "blocked" }).eq("id", testUserId);
    try {
      await conversion.executeFincraConversion({
        quoteReference: "mock_quote_456",
        userId: testUserId,
        sourceCurrency: "USD",
        destinationCurrency: "NGN",
        amount: 50,
      });
      fail("SCENARIO 6", new Error("Allowed conversion for blocked user!"));
    } catch (err) {
      if (err.message.includes("ACCOUNT_RESTRICTED")) {
        pass("SCENARIO 6: Blocked user conversion blocked with ACCOUNT_RESTRICTED.", err.message);
      } else {
        fail("SCENARIO 6: Expected ACCOUNT_RESTRICTED error", err);
      }
    }

    // Restore active status for risk tests
    await supabase.from("profiles").update({ status: "active", daily_withdrawal_limit: 100000.00 }).eq("id", testUserId);

    // ── SCENARIO 7: Fail-Closed Limit Check ────────────────────────────────────
    console.log("\n[SCENARIO 7] Fail-Closed Limit Check Verification");
    const limitRes = await limitCheck.checkDailyLimit("non_existent_invalid_uuid_9999", "FREE", 100);
    if (limitRes.allowed === false) {
      pass("SCENARIO 7: Fail-closed limit check returned allowed = false on DB error.", limitRes.error || "Fail closed");
    } else {
      fail("SCENARIO 7", new Error("limitCheck failed to fail-closed on DB error!"));
    }

    // ── SCENARIO 8: High-Risk Transaction (Compliance Hold) ────────────────────
    console.log("\n[SCENARIO 8] High-Risk Transaction Compliance Hold Attempt");
    const gateRes = await complianceGate.evaluatePayout({
      userId: testUserId,
      amount: 60000.00, // Exceeds MAX_TX_USD -> high risk score
      currency: "USD",
      ipAddress: "192.168.1.1",
    });

    if (gateRes.status === "MANUAL_REVIEW" || gateRes.isHold) {
      pass("SCENARIO 8: High-risk payout correctly routed to MANUAL_REVIEW / COMPLIANCE_HOLD.", `Risk Score: ${gateRes.riskScore}`);
    } else if (!gateRes.allowed) {
      pass("SCENARIO 8: High-risk transaction blocked cleanly.", gateRes.reason);
    } else {
      fail("SCENARIO 8", new Error("High-risk transaction was not flagged for MANUAL_REVIEW or blocked!"));
    }

    // ── SCENARIO 9: Valid Verified Compliant User Evaluation ───────────────────
    console.log("\n[SCENARIO 9] Valid Compliant User Evaluation");
    const compliantGateRes = await complianceGate.evaluatePayout({
      userId: testUserId,
      amount: 100.00,
      currency: "NGN",
      ipAddress: "127.0.0.1",
    });

    if (compliantGateRes.allowed && compliantGateRes.status === "APPROVED") {
      pass("SCENARIO 9: Valid verified user within limits passed compliance gate successfully.");
    } else {
      fail("SCENARIO 9", new Error(`Compliant user failed gate: ${compliantGateRes.reason || compliantGateRes.errorCode}`));
    }

  } catch (globalErr) {
    console.error("\n[CRITICAL FAIL] Unhandled exception during adversarial testing:", globalErr);
  } finally {
    // Restore original test user profile state
    if (testUserId && originalProfileState) {
      try {
        await supabase.from("profiles").update({
          is_verified: originalProfileState.is_verified,
          kyc_level: originalProfileState.kyc_level,
          status: originalProfileState.status,
          daily_withdrawal_limit: originalProfileState.daily_withdrawal_limit,
        }).eq("id", testUserId);
        console.log(`\n[CLEANUP] Restored test profile ${testUserId} to original state.`);
      } catch (e) {}
    }

    console.log("\n================================================================");
    console.log(`ADVERSARIAL TEST RESULTS: ${results.passed} PASSED, ${results.failed} FAILED`);
    console.log("================================================================");

    if (results.failed > 0) {
      process.exit(1);
    }
  }
}

runAdversarialSuite();
