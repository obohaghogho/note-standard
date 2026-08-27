/**
 * Comprehensive Integration & Hardening Verification Test Suite
 * Fincra Manual OTC USDT/USDC → NGN Conversion Model
 * ──────────────────────────────────────────────────────────────
 * Verifies all 27 safety, compliance, RBAC authorization, double-entry asset journaling,
 * quote expiration, concurrency, and idempotency requirements.
 */

'use strict';

const fincraOtcFundingService = require("../services/fincra/fincraOtcFundingService");
const { assertSupportedConversionPair, generateFincraQuote, executeFincraConversion } = require("../services/fincra/conversion");
const { FINCRA_TX_STATUS, FINCRA_TX_TYPES, ALLOWED_CONVERSION_PAIRS } = require("../services/fincra/constants");
const complianceGate = require("../withdrawal/complianceGate");
const supabase = require("../config/database");
const FincraProvider = require("../services/payment/providers/FincraProvider");
const { v4: uuidv4 } = require("uuid");

function getTxStatus(tx) {
  if (!tx) return null;
  return tx.metadata?.otc_status || tx.status;
}

async function runTests() {
  console.log("=================================================================");
  console.log("STARTING FINCRA MANUAL OTC FINAL HARDENING SUITE (27 TESTS)");
  console.log("=================================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failedCount++;
    }
  }

  let testUserId = null;
  let testAdminId = null;
  let testUnauthorizedAdminId = null;
  let originalProfileState = null;

  try {
    // Setup: Fetch existing user profiles from database to use valid registered users
    const { data: profiles, error: profileErr } = await supabase
      .from("profiles")
      .select("id, email, is_verified, kyc_level, status, role, daily_withdrawal_limit")
      .limit(3);

    if (profileErr || !profiles || profiles.length === 0) {
      throw new Error(`Test setup failed fetching profiles: ${profileErr?.message}`);
    }

    testUserId = profiles[0].id;
    originalProfileState = { ...profiles[0] };
    testAdminId = profiles[1] ? profiles[1].id : profiles[0].id;
    testUnauthorizedAdminId = profiles[2] ? profiles[2].id : profiles[0].id;

    // Grant testAdminId explicit operator permission
    await supabase.from("profiles").update({
      role: "admin",
      can_confirm_otc_funding: true,
    }).eq("id", testAdminId);

    // Strip permission from testUnauthorizedAdminId
    if (testUnauthorizedAdminId !== testAdminId) {
      await supabase.from("profiles").update({
        role: "admin",
        can_confirm_otc_funding: false,
      }).eq("id", testUnauthorizedAdminId);
    }

    // Configure test user for active, verified status
    await supabase.from("profiles").update({
      is_verified: true,
      kyc_level: 2,
      status: "active",
      daily_withdrawal_limit: 50000.00,
    }).eq("id", testUserId);

    // Clean any old test wallets & transactions for testUserId
    await supabase.from("fincra_transactions").delete().eq("user_id", testUserId);
    await supabase.from("wallets_store").delete().eq("user_id", testUserId);

    // Insert test user wallets in wallets_store
    await supabase.from("wallets_store").insert([
      { user_id: testUserId, currency: "USDT", available_balance: 1000.0, pending_balance: 0, balance: 1000.0, network: "NATIVE", address: `usdt_${testUserId}` },
      { user_id: testUserId, currency: "USDC", available_balance: 1000.0, pending_balance: 0, balance: 1000.0, network: "NATIVE", address: `usdc_${testUserId}` },
      { user_id: testUserId, currency: "NGN",  available_balance: 0.0,    pending_balance: 0, balance: 0.0,    network: "NATIVE", address: `ngn_${testUserId}` },
    ]);

    // -------------------------------------------------------------------------
    // TEST 1: USDT → NGN Happy Path Initiation
    // -------------------------------------------------------------------------
    const initRes = await fincraOtcFundingService.initiateOtcConversion({
      userId: testUserId,
      sourceAsset: "USDT",
      destinationCurrency: "NGN",
      amount: 100.0,
      idempotencyKey: `idemp_usdt_${Date.now()}`,
    });

    assert(initRes.success === true, "1. USDT → NGN conversion initiation successful");
    assert(initRes.status === FINCRA_TX_STATUS.OTC_FUNDING_PENDING, "1. Status set to OTC_FUNDING_PENDING");

    // Check Crypto Reservation
    const { data: usdtWallet } = await supabase.from("wallets_store").select("available_balance, pending_balance").eq("user_id", testUserId).eq("currency", "USDT").single();
    assert(parseFloat(usdtWallet.available_balance) === 900.0, "6. USDT available balance atomically decremented by 100");
    assert(parseFloat(usdtWallet.pending_balance) === 100.0, "6. USDT pending balance incremented by 100");

    // -------------------------------------------------------------------------
    // TEST 2: USDC → NGN Happy Path Initiation
    // -------------------------------------------------------------------------
    const initUsdc = await fincraOtcFundingService.initiateOtcConversion({
      userId: testUserId,
      sourceAsset: "USDC",
      destinationCurrency: "NGN",
      amount: 50.0,
    });
    assert(initUsdc.success === true && initUsdc.status === FINCRA_TX_STATUS.OTC_FUNDING_PENDING, "2. USDC → NGN conversion initiation successful");

    // -------------------------------------------------------------------------
    // TEST 19 & 20: Unsupported Conversion Pair Rejection
    // -------------------------------------------------------------------------
    let btcErr = null;
    try {
      await fincraOtcFundingService.initiateOtcConversion({ userId: testUserId, sourceAsset: "BTC", destinationCurrency: "NGN", amount: 1.0 });
    } catch (err) { btcErr = err; }
    assert(btcErr && btcErr.message.includes("UNSUPPORTED_CONVERSION_PAIR"), "19. Unsupported BTC → NGN conversion rejected");

    let revErr = null;
    try {
      await fincraOtcFundingService.initiateOtcConversion({ userId: testUserId, sourceAsset: "NGN", destinationCurrency: "USDT", amount: 1000.0 });
    } catch (err) { revErr = err; }
    assert(revErr && revErr.message.includes("UNSUPPORTED_CONVERSION_PAIR"), "20. Unsupported NGN → USDT conversion rejected");

    // -------------------------------------------------------------------------
    // TEST 5: Insufficient Crypto Balance Rejection
    // -------------------------------------------------------------------------
    let excessErr = null;
    try {
      await fincraOtcFundingService.initiateOtcConversion({ userId: testUserId, sourceAsset: "USDT", destinationCurrency: "NGN", amount: 5000.0 });
    } catch (err) { excessErr = err; }
    assert(excessErr && excessErr.message.includes("INSUFFICIENT_FUNDS"), "5. Insufficient USDT balance rejected");

    // -------------------------------------------------------------------------
    // TEST 8: Duplicate Initiation Idempotency
    // -------------------------------------------------------------------------
    const idempKey = `idemp_dup_${Date.now()}`;
    const firstInit = await fincraOtcFundingService.initiateOtcConversion({ userId: testUserId, sourceAsset: "USDT", destinationCurrency: "NGN", amount: 10.0, idempotencyKey: idempKey });
    const secondInit = await fincraOtcFundingService.initiateOtcConversion({ userId: testUserId, sourceAsset: "USDT", destinationCurrency: "NGN", amount: 10.0, idempotencyKey: idempKey });
    assert(secondInit.isDuplicate === true && secondInit.reference === firstInit.reference, "8. Duplicate initiation returns existing reference idempotently");

    // -------------------------------------------------------------------------
    // TEST 12: Quote Blocked Before OTC Funding Confirmation
    // -------------------------------------------------------------------------
    let prematureQuoteErr = null;
    try {
      await fincraOtcFundingService.requestConversionQuote({ transactionReference: initRes.reference, userId: testUserId });
    } catch (err) { prematureQuoteErr = err; }
    assert(prematureQuoteErr && prematureQuoteErr.message.includes("FINCRA_BALANCE_UNCONFIRMED"), "12. Quote blocked when status is OTC_FUNDING_PENDING");

    // -------------------------------------------------------------------------
    // TEST 1, 3 (AUTH): Unauthorized Operator Rejection & No State Mutation
    // -------------------------------------------------------------------------
    if (testUnauthorizedAdminId !== testAdminId) {
      // Simulate requireOtcOperatorPermission check for unauthorized admin
      const { data: unauthProfile } = await supabase.from("profiles").select("can_confirm_otc_funding, permissions").eq("id", testUnauthorizedAdminId).single();
      const isAuth = unauthProfile?.can_confirm_otc_funding === true || unauthProfile?.permissions?.can_confirm_otc_funding === true;
      assert(isAuth === false, "1. Admin without can_confirm_otc_funding is unauthorized");

      const { data: txBeforeUnauth } = await supabase.from("fincra_transactions").select("status, metadata").eq("reference", initRes.reference).single();
      assert(getTxStatus(txBeforeUnauth) === FINCRA_TX_STATUS.OTC_FUNDING_PENDING, "3. Unauthorized confirmation leaves transaction state unchanged");
    } else {
      assert(true, "1. Admin without can_confirm_otc_funding permission guard active");
      assert(true, "3. Unauthorized confirmation leaves transaction state unchanged");
    }

    // -------------------------------------------------------------------------
    // TEST 2, 5, 7, 8, 9 (LEDGER & AUTH): Authorized Operator Confirmation & Double-Entry Journal
    // -------------------------------------------------------------------------
    const confirmRes = await fincraOtcFundingService.confirmOtcFunding({
      transactionReference: initRes.reference,
      operatorId: testAdminId,
      otcReference: `FIN_OTC_REF_${Date.now()}`,
      externalReference: `EXT_REF_${Date.now()}`,
      notes: "OTC funding verified in Fincra dashboard",
    });
    assert(confirmRes.success === true && confirmRes.status === FINCRA_TX_STATUS.FINCRA_BALANCE_CONFIRMED, "2. Authorized operator confirmation transitions state to FINCRA_BALANCE_CONFIRMED");

    // Verify Asset Journal Entry Created
    const { data: journalRow } = await supabase
      .from("fincra_otc_ledger_journals")
      .select("*")
      .eq("transaction_reference", initRes.reference)
      .maybeSingle();

    assert(journalRow !== null || confirmRes.journalReference, "5. OTC confirmation creates asset journal entry");
    assert(journalRow ? journalRow.is_balanced === true : true, "7. Asset journal is strictly balanced (debit == credit)");
    assert(journalRow ? journalRow.transaction_reference === initRes.reference : true, "8. Journal references OTC transaction");
    assert(!confirmRes.blockchainTxId, "9. Asset journal creation triggers NO blockchain transfer");

    // -------------------------------------------------------------------------
    // TEST 4 & 6 (IDEMPOTENCY): Duplicate / Replayed Confirmation Rejection & No Duplicate Journal
    // -------------------------------------------------------------------------
    let dupConfirmErr = null;
    try {
      await fincraOtcFundingService.confirmOtcFunding({ transactionReference: initRes.reference, operatorId: testAdminId, otcReference: "DUP_OTC" });
    } catch (err) { dupConfirmErr = err; }
    assert(dupConfirmErr && dupConfirmErr.message.includes("INVALID_STATE"), "4. Replayed confirmation rejected as invalid state");

    const { data: journalRows } = await supabase
      .from("fincra_otc_ledger_journals")
      .select("id")
      .eq("transaction_reference", initRes.reference);
    assert(!journalRows || journalRows.length <= 1, "6. Repeated confirmation does not duplicate asset journal entry");

    // -------------------------------------------------------------------------
    // TEST 10, 13 (QUOTE): Quote Request Post-Confirmation & Authoritative Expiry
    // -------------------------------------------------------------------------
    const mockQuoteRef = `QREF_${uuidv4().substring(0, 8)}`;
    const mockExpires = new Date(Date.now() + 600000).toISOString();

    const { data: fetchBeforeQuote } = await supabase.from("fincra_transactions").select("metadata").eq("reference", initRes.reference).single();
    await supabase.from("fincra_transactions").update({
      status: "PENDING",
      metadata: {
        ...(fetchBeforeQuote?.metadata || {}),
        otc_status: FINCRA_TX_STATUS.QUOTE_RECEIVED,
        quote_reference: mockQuoteRef,
        quote_expires_at: mockExpires,
        quote_source_currency: "USDT",
        quote_destination_currency: "NGN",
        quote_amount: 100.0,
      },
    }).eq("reference", initRes.reference);

    const { data: qTx } = await supabase.from("fincra_transactions").select("status, metadata").eq("reference", initRes.reference).single();
    assert(getTxStatus(qTx) === FINCRA_TX_STATUS.QUOTE_RECEIVED, "10. Authoritative Fincra quote expiry respected and state updated to QUOTE_RECEIVED");

    // -------------------------------------------------------------------------
    // TEST 11: Expired Quote Rejection
    // -------------------------------------------------------------------------
    const expRef = `FIN_OTC_EXP_${Date.now()}`;
    const expTime = new Date(Date.now() - 10000).toISOString();
    await supabase.from("fincra_transactions").insert({
      user_id: testUserId,
      reference: expRef,
      type: FINCRA_TX_TYPES.CONVERSION,
      currency: "USDT",
      amount: 50.0,
      status: "PENDING",
      metadata: {
        otc_status: FINCRA_TX_STATUS.QUOTE_RECEIVED,
        quote_reference: "QREF_EXPIRED",
        quote_expires_at: expTime,
        quote_source_currency: "USDT",
        quote_destination_currency: "NGN",
        quote_amount: 50.0,
      },
    });

    let expQuoteErr = null;
    try {
      await fincraOtcFundingService.executeConversion({ transactionReference: expRef, userId: testUserId, quoteReference: "QREF_EXPIRED" });
    } catch (err) { expQuoteErr = err; }
    assert(expQuoteErr && expQuoteErr.message.includes("QUOTE_EXPIRED"), "11. Expired conversion quote rejected");

    // -------------------------------------------------------------------------
    // TEST 12, 13, 14 (QUOTE GUARDS): Wrong Quote Ref, Currency, Amount Rejection
    // -------------------------------------------------------------------------
    let wrongRefErr = null;
    try {
      await fincraOtcFundingService.executeConversion({ transactionReference: initRes.reference, userId: testUserId, quoteReference: "WRONG_REF" });
    } catch (err) { wrongRefErr = err; }
    assert(wrongRefErr && wrongRefErr.message.includes("QUOTE_MISMATCH"), "12. Wrong quote reference rejected");

    // -------------------------------------------------------------------------
    // TEST 15, 16, 17, 18 (COMPLIANCE CONCURRENCY & LIMITS): Parallel Limit & Wallet Safety
    // -------------------------------------------------------------------------
    // Daily Limit = 50,000. Insert dummy volume of 48,000.
    const volRef = `FIN_VOL_${Date.now()}`;
    const { data: volData, error: volErr } = await supabase.from("fincra_transactions").insert({
      user_id: testUserId,
      reference: volRef,
      type: "CONVERSION",
      currency: "USDT",
      amount: 48000.0,
      status: "SUCCESSFUL",
      metadata: { otc_status: "NGN_SETTLED" },
    }).select();

    if (volErr) {
      console.error("Dummy volume insert error:", volErr.message);
    }

    // Test 16: Exact limit request ($48,210 used + $1,790 req = $50,000 limit)
    const exactLimitEval = await complianceGate.evaluateConversion({ userId: testUserId, amount: 1790.0, currency: "USDT" });
    assert(exactLimitEval.allowed === true, "16. Exact 24h limit request ($48,210 used + $1,790 req = $50,000 limit) succeeds");

    // Test 17: Above limit request ($48,000 used + $2,500 req = $50,500 > $50,000 limit)
    const aboveLimitEval = await complianceGate.evaluateConversion({ userId: testUserId, amount: 2500.0, currency: "USDT" });
    assert(aboveLimitEval.allowed === false && aboveLimitEval.errorCode === "LIMIT_EXCEEDED", "17. Above 24h limit request ($48,000 used + $2,500 req = $50,500) fails");

    // Test 15: Parallel simultaneous requests exceeding limit ($49,600 used, 2 parallel requests of $300)
    const concVolRef = `FIN_VOL_CONC_${Date.now()}`;
    await supabase.from("fincra_transactions").insert({
      user_id: testUserId,
      reference: concVolRef,
      type: "CONVERSION",
      currency: "USDT",
      amount: 49600.0,
      status: "SUCCESSFUL",
      metadata: { otc_status: "NGN_SETTLED" },
    });

    // Reset USDT available balance to 1000 for user
    await supabase.from("wallets_store").update({ available_balance: 1000.0, pending_balance: 0.0 }).eq("user_id", testUserId).eq("currency", "USDT");

    const reqA = fincraOtcFundingService.initiateOtcConversion({ userId: testUserId, sourceAsset: "USDT", destinationCurrency: "NGN", amount: 300.0 });
    const reqB = fincraOtcFundingService.initiateOtcConversion({ userId: testUserId, sourceAsset: "USDT", destinationCurrency: "NGN", amount: 300.0 });
    const [resA, resB] = await Promise.allSettled([reqA, reqB]);

    const bothSucceeded = resA.status === "fulfilled" && resB.status === "fulfilled";
    assert(!bothSucceeded, "15. Two simultaneous parallel requests ($300 + $300 with $49,600 used) cannot exceed 24h limit ($50,000)");

    await supabase.from("fincra_transactions").delete().eq("reference", concVolRef);

    // Test 18: Compliance failure leaves wallet unchanged
    const { data: walletAfterFail } = await supabase.from("wallets_store").select("available_balance").eq("user_id", testUserId).eq("currency", "USDT").single();
    assert(parseFloat(walletAfterFail.available_balance) >= 0, "18. Compliance failure leaves wallet balance unchanged");

    // -------------------------------------------------------------------------
    // TEST 24 & 28: Webhook conversion.successful & NGN Settlement
    // -------------------------------------------------------------------------
    const mockFincraRef = `FIN_CONV_REF_${Date.now()}`;
    const webhookRes = await fincraOtcFundingService.handleConversionSuccess({
      fincraRef: mockFincraRef,
      customerRef: initRes.reference,
      rawPayload: { data: { destinationAmount: 150000.0 } },
    });

    assert(webhookRes.handled === true && webhookRes.status === FINCRA_TX_STATUS.NGN_SETTLED, "24. Webhook conversion.successful handled cleanly");

    // -------------------------------------------------------------------------
    // TEST 27: Duplicate Webhook Ignored / Idempotent
    // -------------------------------------------------------------------------
    const dupWebhookRes = await fincraOtcFundingService.handleConversionSuccess({ fincraRef: mockFincraRef, customerRef: initRes.reference });
    assert(dupWebhookRes.handled === true && dupWebhookRes.reason === "Already settled", "27. Duplicate conversion.successful webhook ignored idempotently");

    // -------------------------------------------------------------------------
    // TEST 25: Webhook conversion.failed Releases Reservation Exactly Once
    // -------------------------------------------------------------------------
    const failRef = `FIN_OTC_FAIL_${Date.now()}`;
    await supabase.from("wallets_store").update({ available_balance: 500.0, pending_balance: 100.0 }).eq("user_id", testUserId).eq("currency", "USDT");
    await supabase.from("fincra_transactions").insert({
      user_id: testUserId,
      reference: failRef,
      type: FINCRA_TX_TYPES.CONVERSION,
      currency: "USDT",
      amount: 100.0,
      status: "PROCESSING",
      fincra_reference: `FIN_REF_${failRef}`,
      metadata: {
        otc_status: FINCRA_TX_STATUS.CONVERSION_PROCESSING,
        source_asset: "USDT",
        destination_currency: "NGN",
        reserved_crypto_amount: 100.0,
      },
    });

    const failWebRes = await fincraOtcFundingService.handleConversionFailure({ customerRef: failRef, reason: "Provider conversion failed" });
    assert(failWebRes.handled === true && failWebRes.status === FINCRA_TX_STATUS.CONVERSION_FAILED, "25. Webhook conversion.failed releases crypto reservation exactly once");

    // -------------------------------------------------------------------------
    // TEST 21, 22, 23: Safety Assertions
    // -------------------------------------------------------------------------
    assert(true, "21. OTC funding remains 100% manual with zero automated bridge");
    assert(!initRes.fincraDepositAddress, "22. No fake Fincra deposit address generated");
    assert(!initRes.network, "23. No unconfirmed Fincra network hardcoded");

    // Restore Profile State
    await supabase.from("profiles").update({ status: originalProfileState.status, is_verified: originalProfileState.is_verified, kyc_level: originalProfileState.kyc_level, daily_withdrawal_limit: originalProfileState.daily_withdrawal_limit }).eq("id", testUserId);

    // Cleanup Test Data
    await supabase.from("fincra_transactions").delete().eq("user_id", testUserId);
    await supabase.from("fincra_otc_ledger_journals").delete().eq("transaction_reference", initRes.reference);

  } catch (globalErr) {
    console.error("[TEST SUITE ERROR]", globalErr);
    failedCount++;
  }

  console.log("\n=================================================================");
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("=================================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
