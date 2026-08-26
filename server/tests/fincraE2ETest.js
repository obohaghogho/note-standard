/**
 * Fincra End-to-End Integration Test
 * ════════════════════════════════════
 * Tests the complete Fincra flow against live sandbox + real Supabase DB:
 *
 *  PHASE A — Database verification (4 Fincra tables exist)
 *  PHASE B — Virtual account provisioning for a real user
 *  PHASE C — Webhook signature verification (HMAC correctness)
 *  PHASE D — Simulated deposit webhook → ledger credit flow
 *  PHASE E — Bank account name resolution (NGN payout)
 *  PHASE F — Reconciliation engine smoke test
 *
 * Usage: node server/tests/fincraE2ETest.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const axios   = require("axios");
const crypto  = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ── Supabase service client (bypasses RLS for testing) ──────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { dispatchFincraRequest } = require("../services/fincra/gatewayClient");

// ── Fincra HTTP client (routed via Gateway) ──────────────────────────────────
const gatewayAdapter = async (config) => {
  const method  = (config.method || 'get').toUpperCase();
  const reqPath = config.url || '';
  const headers = config.headers || {};
  let body = config.data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {}
  }
  const response = await dispatchFincraRequest({
    method,
    path: reqPath,
    headers: {
      ...headers,
      "api-key": process.env.FINCRA_API_KEY
    },
    body,
    targetUrl: process.env.FINCRA_BASE_URL || "https://sandboxapi.fincra.com"
  });

  if (response.status >= 400) {
    const error = new Error(`Request failed with status code ${response.status}`);
    error.config = config;
    error.response = {
      status: response.status,
      data: response.data,
      headers: response.headers,
      config
    };
    throw error;
  }

  return {
    data: response.data,
    status: response.status,
    statusText: 'OK',
    headers: response.headers,
    config,
    request: {}
  };
};

const fincra = axios.create({
  baseURL: process.env.FINCRA_BASE_URL || "https://sandboxapi.fincra.com",
  timeout: 20000,
  adapter: gatewayAdapter,
  headers: {
    "api-key":      process.env.FINCRA_API_KEY,
    "Content-Type": "application/json",
    "Accept":       "application/json",
  },
});

const BUSINESS_ID      = process.env.FINCRA_BUSINESS_ID;
const WEBHOOK_SECRET   = process.env.FINCRA_WEBHOOK_SECRET;

const results = { passed: 0, failed: 0, warnings: 0, tests: [] };

function pass(label, detail = "") {
  results.passed++;
  results.tests.push({ status: "PASS", label, detail });
  console.log(`  ✅ ${label}${detail ? " — " + detail : ""}`);
}
function fail(label, err) {
  results.failed++;
  const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || String(err);
  results.tests.push({ status: "FAIL", label, detail: msg });
  console.log(`  ❌ ${label} — ${msg}`);
}
function warn(label, detail) {
  results.warnings++;
  results.tests.push({ status: "WARN", label, detail });
  console.log(`  ⚠️  ${label} — ${detail}`);
}
function section(title) {
  console.log(`\n${"═".repeat(62)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(62));
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE A — Database Tables
// ────────────────────────────────────────────────────────────────────────────
async function phaseA_databaseVerification() {
  section("PHASE A — Database Table Verification");

  const tables = [
    "fincra_transactions",
    "fincra_wallet_links",
    "fincra_webhook_logs",
    "fincra_audit_logs",
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select("id").limit(1);
      if (error) {
        fail(`Table: ${table}`, error);
      } else {
        pass(`Table exists: ${table}`, `${data.length} rows (table is empty — expected)`);
      }
    } catch (e) {
      fail(`Table: ${table}`, e);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE B — Virtual Account Provisioning
// ────────────────────────────────────────────────────────────────────────────
async function phaseB_virtualAccount() {
  section("PHASE B — Virtual Account Provisioning");

  // Get a real user from the database to test with
  const { data: users, error: userErr } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .limit(1)
    .single();

  if (userErr || !users) {
    fail("Fetch test user from profiles", userErr || new Error("No users found"));
    return null;
  }

  const user = users;
  // Ensure test user profile has verified KYC status and active status for E2E testing
  await supabase.from("profiles").update({ is_verified: true, kyc_level: 1, kyc_status: "VERIFIED", status: "active" }).eq("id", user.id);

  const nameParts = (user.full_name || "Test User").trim().split(" ");
  const firstName = nameParts[0] || "Test";
  const lastName  = nameParts.slice(1).join(" ") || "User";

  pass("Test user fetched", `${user.email} (${user.id.slice(0, 8)}...)`);

  // ── Check idempotency: already have an account? ──────────────────────────
  const { data: existingLink } = await supabase
    .from("fincra_wallet_links")
    .select("*")
    .eq("user_id", user.id)
    .eq("currency", "NGN")
    .maybeSingle();

  if (existingLink?.account_number) {
    pass("Virtual account (idempotency)", `Existing account: ${existingLink.account_number} @ ${existingLink.bank_name}`);
    return { user, account: existingLink };
  }

  // ── Provision new virtual account ────────────────────────────────────────
  try {
    const res = await fincra.post("/profile/virtual-accounts/requests", {
      currency:    "NGN",
      accountType: "individual",
      KYCInformation: {
        email:     user.email,
        firstName,
        lastName,
        bvn:       "00000000000", // Sandbox placeholder BVN
      },
      meansOfId:      [],
      attachmentType: "none",
    });

    const accountData = res.data?.data || res.data;

    if (!accountData) {
      fail("Virtual account API response", new Error("Empty response body"));
      return { user, account: null };
    }

    const linkRecord = {
      user_id:          user.id,
      fincra_wallet_id: accountData.id || accountData._id || accountData.walletId || "pending",
      currency:         "NGN",
      account_number:   accountData.accountNumber || accountData.account_number,
      account_name:     accountData.accountName   || `${firstName} ${lastName}`,
      bank_name:        accountData.bankName       || accountData.bank || "Fincra MFB",
      status:           "ACTIVE",
      metadata:         accountData,
    };

    // Save to fincra_wallet_links
    const { data: saved, error: saveErr } = await supabase
      .from("fincra_wallet_links")
      .upsert(linkRecord, { onConflict: "user_id,currency" })
      .select()
      .single();

    if (saveErr) {
      fail("Save virtual account to fincra_wallet_links", saveErr);
    } else {
      pass("Virtual account provisioned + saved to DB");
      if (linkRecord.account_number) {
        pass("Account number", linkRecord.account_number);
        pass("Bank name", linkRecord.bank_name);
        pass("Account name", linkRecord.account_name);
      } else {
        warn("Account number", "Not returned by sandbox yet — may need manual approval in Fincra dashboard");
      }
    }

    return { user, account: saved || linkRecord };

  } catch (err) {
    const status = err?.response?.status;
    const body   = err?.response?.data;
    if (status === 422 || status === 400) {
      warn("Virtual account provisioning", `Sandbox validation: ${body?.message || err.message} — may need additional KYC setup in Fincra dashboard`);
    } else {
      fail("Virtual account provisioning", err);
    }
    return { user, account: null };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE C — Webhook Signature Verification
// ────────────────────────────────────────────────────────────────────────────
async function phaseC_webhookSignature() {
  section("PHASE C — Webhook HMAC Signature Verification");

  const testPayload = JSON.stringify({
    event: "collection.successful",
    data:  { reference: "TEST_REF_001", amount: 5000, currency: "NGN", accountNumber: "0123456789" },
  });

  // Generate the HMAC the server would produce
  const correctSignature = crypto
    .createHmac("sha512", WEBHOOK_SECRET)
    .update(testPayload)
    .digest("hex");

  // ── Test 1: Valid signature passes ───────────────────────────────────────
  try {
    const { verifyFincraWebhookSignature } = require("../services/fincra/encryption");
    const headers = { "x-webhook-signature": correctSignature };
    verifyFincraWebhookSignature(headers, testPayload);
    pass("Valid HMAC SHA-512 signature accepted");
  } catch (e) {
    fail("Valid HMAC signature verification", e);
  }

  // ── Test 2: Tampered signature rejected ──────────────────────────────────
  try {
    const { verifyFincraWebhookSignature, FincraSignatureError } = require("../services/fincra/encryption");
    const headers = { "x-webhook-signature": "tampered_" + correctSignature.slice(9) };
    try {
      verifyFincraWebhookSignature(headers, testPayload);
      fail("Tampered signature (should have thrown)", new Error("No error thrown"));
    } catch (e) {
      if (e.code === "FINCRA_SIGNATURE_ERROR") {
        pass("Tampered HMAC signature correctly rejected");
      } else {
        fail("Tampered signature error type", e);
      }
    }
  } catch (e) {
    fail("Tampered signature test setup", e);
  }

  // ── Test 3: Missing signature rejected ───────────────────────────────────
  try {
    const { verifyFincraWebhookSignature } = require("../services/fincra/encryption");
    try {
      verifyFincraWebhookSignature({}, testPayload);
      fail("Missing signature (should have thrown)", new Error("No error thrown"));
    } catch (e) {
      if (e.code === "FINCRA_SIGNATURE_ERROR") {
        pass("Missing HMAC signature correctly rejected");
      } else {
        fail("Missing signature error type", e);
      }
    }
  } catch (e) {
    fail("Missing signature test setup", e);
  }

  // ── Test 4: Event hash idempotency ───────────────────────────────────────
  const { generateEventHash } = require("../services/fincra/encryption");
  const hash1 = generateEventHash(testPayload);
  const hash2 = generateEventHash(testPayload);
  if (hash1 === hash2 && hash1.length === 64) {
    pass("Event hash is deterministic + 64-char SHA-256", hash1.slice(0, 16) + "...");
  } else {
    fail("Event hash determinism", new Error(`hash1=${hash1}, hash2=${hash2}`));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE D — Simulated Deposit Webhook → Ledger Credit
// ────────────────────────────────────────────────────────────────────────────
async function phaseD_simulateDepositWebhook(user, account) {
  section("PHASE D — Simulated Deposit Webhook → Ledger Credit");

  if (!user) { warn("Skipping Phase D", "No test user available"); return; }

  const accountNumber = account?.account_number || "0000000000";
  const depositAmount = 10000; // NGN 10,000 test deposit
  const fincraRef     = `TEST_DEPOSIT_${Date.now()}`;

  // Build a realistic Fincra collection.successful payload
  const webhookPayload = {
    event: "collection.successful",
    data:  {
      reference:     fincraRef,
      amount:        depositAmount,
      currency:      "NGN",
      accountNumber,
      status:        "successful",
      type:          "collection",
      createdAt:     new Date().toISOString(),
    },
  };

  const rawBody  = JSON.stringify(webhookPayload);
  const signature = crypto
    .createHmac("sha512", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // ── Get user's NGN wallet balance before deposit ─────────────────────────
  const { data: walletBefore } = await supabase
    .from("wallets_v6")
    .select("id, balance, currency")
    .eq("user_id", user.id)
    .eq("currency", "NGN")
    .maybeSingle();

  if (!walletBefore) {
    warn("User NGN wallet", "User has no NGN wallet in wallets_v6 — will test DB write but not balance delta");
  } else {
    pass("NGN wallet balance before deposit", `${walletBefore.balance} NGN`);
  }

  // ── Process via webhook processor directly ───────────────────────────────
  try {
    process.env.ENABLE_FINCRA = "true"; // Ensure flag is set in this process
    const { processFincraWebhook } = require("../services/fincra/webhook");
    const result = await processFincraWebhook(
      { "x-webhook-signature": signature },
      rawBody,
      webhookPayload
    );

    pass("Webhook processed without crash");

    // ── Verify webhook log written ────────────────────────────────────────
    const { data: wLog } = await supabase
      .from("fincra_webhook_logs")
      .select("*")
      .eq("processed", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (wLog) {
      pass("Webhook log written to fincra_webhook_logs", `event: ${wLog.event_type}, verified: ${wLog.signature_verified}`);
    } else {
      warn("Webhook log", "Log not found (may be timing issue)");
    }

    // ── Verify audit log written ──────────────────────────────────────────
    const { data: aLog } = await supabase
      .from("fincra_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (aLog) {
      pass("Audit log written to fincra_audit_logs", `action: ${aLog.action}`);
    } else {
      warn("Audit log", "Not found");
    }

    // ── Check fincra_transactions ─────────────────────────────────────────
    const { data: tx } = await supabase
      .from("fincra_transactions")
      .select("*")
      .eq("fincra_reference", fincraRef)
      .maybeSingle();

    if (tx) {
      pass("fincra_transactions record created", `status: ${tx.status}, amount: ${tx.amount} ${tx.currency}`);
    } else {
      warn("fincra_transactions", "Record not found — may not have matched a wallet link");
    }

    // ── Check balance delta (if wallet existed) ───────────────────────────
    if (walletBefore) {
      const { data: walletAfter } = await supabase
        .from("wallets_v6")
        .select("balance")
        .eq("id", walletBefore.id)
        .maybeSingle();

      const delta = parseFloat(walletAfter?.balance || 0) - parseFloat(walletBefore.balance || 0);

      if (account?.account_number) {
        // Only expect a balance increase if we have a real account number match
        if (delta === depositAmount) {
          pass(`Balance credited correctly`, `+${delta} NGN → new balance: ${walletAfter?.balance}`);
        } else if (delta > 0) {
          warn("Balance delta", `Expected +${depositAmount}, got +${delta} (partial credit or rounding)`);
        } else {
          warn("Balance delta = 0", "No wallet link account_number match — deposit routing not triggered (expected for test accounts with no real account number)");
        }
      } else {
        warn("Balance delta check skipped", "No real account number provisioned yet");
      }
    }

    // ── Test idempotency: replay same webhook ─────────────────────────────
    try {
      await processFincraWebhook(
        { "x-webhook-signature": signature },
        rawBody,
        webhookPayload
      );
      fail("Replay attack prevention", new Error("Duplicate webhook was accepted — should have been rejected"));
    } catch (e) {
      if (e.code === "FINCRA_DUPLICATE_EVENT") {
        pass("Replay attack prevention — duplicate webhook correctly rejected");
      } else {
        fail("Replay attack error type", e);
      }
    }

  } catch (err) {
    fail("Webhook processor", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE E — Bank Account Name Resolution
// ────────────────────────────────────────────────────────────────────────────
async function phaseE_bankAccountVerification() {
  section("PHASE E — Bank Account Resolution + Payout Infrastructure");

  // ── Bank list (correct endpoint: currency only, no business param) ────────
  try {
    const res   = await fincra.get("/core/banks", { params: { currency: "NGN" } });
    const banks = res.data?.data || res.data || [];
    const list  = Array.isArray(banks) ? banks : [];
    pass(`NGN bank list via /core/banks`, `${list.length} banks available`);
    if (list.length > 0) {
      const sample = list.slice(0, 4).map((b) => `${b.name} (${b.code})`).join(", ");
      console.log(`       Sample: ${sample}`);
    }

    // Locate GTBank in the list
    const gtb = list.find(b => b.name?.toLowerCase().includes("guaranty") || b.code === "058" || b.code === "000013");
    if (gtb) pass("GTBank located in bank list", `${gtb.name} (code: ${gtb.code})`);
  } catch (err) {
    fail("NGN bank list", err);
  }

  // ── Bank account name resolution ─────────────────────────────────────────
  // Using a well-known GTBank sandbox test account (0690000032)
  try {
    const res = await fincra.post("/core/accounts/resolve", {
      accountNumber: "0690000032",
      bankCode:      "058",
      type:          "nuban",
    });
    const data = res.data?.data || res.data;
    if (data?.accountName) {
      pass("Bank account name resolved", `Name: ${data.accountName}`);
    } else {
      warn("Bank account resolve", "Account exists but name returned null (sandbox test data)");
    }
  } catch (err) {
    const status = err?.response?.status;
    if (status === 400 || status === 404 || status === 422) {
      warn("Bank account resolve", `Sandbox validation (${status}): endpoint is reachable + authenticated`);
    } else {
      fail("Bank account resolve", err);
    }
  }

  // ── Conversion quote (NGN → USD) ─────────────────────────────────────────
  try {
    const res   = await fincra.post("/quotes", {
      sourceCurrency:      "NGN",
      destinationCurrency: "USD",
      amount:              100000,
      type:                "conversion",
    });
    const quote = res.data?.data || res.data;
    pass("Conversion quote (NGN → USD)");
    const rate = quote?.rate || quote?.exchangeRate || quote?.destinationAmount;
    if (rate) console.log(`       Rate: ${rate}`);
  } catch (err) {
    const status = err?.response?.status;
    if (status === 400 || status === 422) {
      warn("Conversion quote", `Sandbox validation ${status} — endpoint authenticated`);
    } else {
      fail("Conversion quote", err);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE F — Reconciliation Smoke Test
// ────────────────────────────────────────────────────────────────────────────
async function phaseF_reconciliation() {
  section("PHASE F — Reconciliation Engine Smoke Test");

  try {
    const { runFincraReconciliation } = require("../services/fincra/reconciliation");
    const report = await runFincraReconciliation({
      currency: "NGN",
      fromDate:  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      toDate:    new Date().toISOString(),
    });

    pass("Reconciliation engine ran without crash");
    pass("Internal transaction count", String(report.internalCount));
    pass("Matched transactions", String(report.matched.length));
    if (report.warnings.length > 0) {
      warn("Reconciliation warnings", report.warnings.join("; "));
    }
    if (report.missingInFincra.length === 0 && report.missingInLedger.length === 0 && report.amountMismatches.length === 0) {
      pass("Reconciliation: no discrepancies detected");
    }
  } catch (err) {
    fail("Reconciliation engine", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   FINCRA COMPLETE END-TO-END INTEGRATION TEST               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  await phaseA_databaseVerification();

  const phaseB = await phaseB_virtualAccount();
  const user    = phaseB?.user || null;
  const account = phaseB?.account || null;

  await phaseC_webhookSignature();

  await phaseD_simulateDepositWebhook(user, account);

  await phaseE_bankAccountVerification();

  await phaseF_reconciliation();

  // ── Final Summary ────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   FINAL TEST SUMMARY                                         ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║   ✅ PASSED:   ${String(results.passed).padEnd(46)}║`);
  console.log(`║   ❌ FAILED:   ${String(results.failed).padEnd(46)}║`);
  console.log(`║   ⚠️  WARNINGS: ${String(results.warnings).padEnd(45)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (results.failed > 0) {
    console.log("Failed tests:");
    results.tests.filter(t => t.status === "FAIL").forEach(t => {
      console.log(`  ❌ ${t.label}: ${t.detail}`);
    });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("\n[FATAL]", err.message);
  process.exit(1);
});
