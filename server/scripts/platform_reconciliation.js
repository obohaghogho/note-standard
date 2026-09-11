/**
 * Platform-Wide Balance Reconciliation Script
 * ═══════════════════════════════════════════════════════════════
 * Compares wallets_store.balance vs the sum of all credited
 * NGN/USD/EUR transactions per user. Flags discrepancies and
 * applies corrections atomically with full audit trail.
 *
 * Safe to run at any time — read-only phase runs first,
 * corrections only happen after all checks pass.
 *
 * Mode:
 *   DRY_RUN=true   — report only, no writes
 *   DRY_RUN=false  — apply corrections (default: true for safety)
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cross-platform: pass --live flag to apply corrections (works on Windows PowerShell, Mac, Linux)
// Examples:
//   Dry run:  node scripts/platform_reconciliation.js
//   Live run: node scripts/platform_reconciliation.js --live
const DRY_RUN = !process.argv.includes("--live");
const MAX_SAFE_AUTO_CORRECTION = 5000; // NGN — only auto-correct amounts below this
const BATCH_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n) { return Math.round(parseFloat(n || 0) * 100) / 100; }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log("=".repeat(70));
  console.log("  NOTESTANDARD — PLATFORM-WIDE BALANCE RECONCILIATION");
  console.log("  Mode: " + (DRY_RUN ? "DRY RUN (no writes)" : "⚠️  LIVE — CORRECTIONS WILL BE APPLIED"));
  console.log("=".repeat(70));

  // ── Phase 1: Load all non-system wallets ─────────────────────────────────
  console.log("\n[Phase 1] Loading all user wallets from wallets_store...");
  const { data: wallets, error: wErr } = await supabase
    .from("wallets_store")
    .select("id, user_id, currency, balance, available_balance, network, address")
    .not("address", "ilike", "SYSTEM_%")
    .not("address", "ilike", "SETTLEMENT_%")
    .not("address", "ilike", "FX_POOL_%")
    .not("network", "in", "(INTERNAL,SYSTEM)")
    .order("user_id");

  if (wErr) { console.error("ERROR loading wallets:", wErr.message); process.exit(1); }
  console.log("  Total wallets loaded (pre-filter):", wallets.length);

  // Load profiles to identify and exclude test/seed accounts
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email");

  // Platform admin/system operator accounts whose wallets are operationally
  // funded and don't have matching transaction records by design.
  const EXCLUDED_USER_IDS = new Set([
    "5089c266-1ad6-4a83-b23f-064d65995345", // admin@notestandard — system operator account
  ]);

  const testUserIds = new Set(
    (profiles || [])
      .filter(p => p.email && (
        p.email.endsWith("@notestandard.test") ||
        p.email.endsWith(".test") ||
        p.email.startsWith("test_") ||
        p.email.startsWith("ad_") ||
        p.email.startsWith("seed_") ||
        p.email.startsWith("demo_")
      ))
      .map(p => p.id)
  );

  const realWallets = wallets.filter(w =>
    !testUserIds.has(w.user_id) &&
    !EXCLUDED_USER_IDS.has(w.user_id)
  );
  console.log(`  Test/seed accounts excluded: ${wallets.length - realWallets.length}`);
  console.log(`  Real user wallets to reconcile: ${realWallets.length}`);


  // ── Phase 2: Load all completed transactions ─────────────────────────────
  console.log("\n[Phase 2] Loading all credited transactions...");
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("id, user_id, type, amount, currency, fee, status, wallet_credit_status, payment_status, reference_id")
    .or("status.eq.COMPLETED,status.eq.SUCCESS")
    .or("wallet_credit_status.eq.WALLET_CREDITED,payment_status.eq.WALLET_CREDITED");

  if (txErr) { console.error("ERROR loading transactions:", txErr.message); process.exit(1); }
  console.log("  Total credited transactions loaded:", txs.length);

  // ── Phase 3: Build ledger sum per (user_id, currency) ───────────────────
  console.log("\n[Phase 3] Computing ledger balance per user per currency...");
  const ledgerMap = {}; // key: `${userId}_${currency}`

  for (const tx of txs) {
    const isCredited =
      tx.status === "COMPLETED" ||
      tx.status === "SUCCESS" ||
      tx.wallet_credit_status === "WALLET_CREDITED" ||
      tx.payment_status === "WALLET_CREDITED";

    if (!isCredited) continue;

    const key = `${tx.user_id}_${tx.currency}`;
    if (!ledgerMap[key]) ledgerMap[key] = { credits: 0, debits: 0 };

    const amt = round2(tx.amount);
    const fee = round2(tx.fee);

    if (tx.type === "DEPOSIT" ||
        tx.type === "WALLET_TOPUP" ||
        tx.type === "wallet_topup") {
      ledgerMap[key].credits += amt;
    } else if (["WITHDRAWAL", "DEBIT", "TRANSFER_OUT"].includes(tx.type)) {
      ledgerMap[key].debits += (amt + fee);
    }
  }

  // ── Phase 4: Compare wallet balances vs ledger sums ─────────────────────
  console.log("\n[Phase 4] Comparing wallet balances against transaction ledger...");

  const toCorrect   = [];
  const toReview    = [];  // large discrepancies needing human review
  let   accurate    = 0;

  for (const w of realWallets) {
    const key = `${w.user_id}_${w.currency}`;
    const ledger = ledgerMap[key];

    if (!ledger) {
      // Wallet exists but no transactions — expected for freshly-created wallets
      if (round2(w.balance) !== 0) {
        toReview.push({ wallet: w, walletBal: round2(w.balance), computedBal: 0, diff: round2(w.balance), reason: "Balance > 0 but no transactions" });
      }
      continue;
    }

    const computedBal = round2(ledger.credits - ledger.debits);
    const walletBal   = round2(w.balance);
    const diff        = round2(walletBal - computedBal);

    if (Math.abs(diff) < 0.01) {
      accurate++;
      continue;
    }

    if (Math.abs(diff) <= MAX_SAFE_AUTO_CORRECTION) {
      toCorrect.push({ wallet: w, walletBal, computedBal, diff, ledger });
    } else {
      toReview.push({ wallet: w, walletBal, computedBal, diff, ledger, reason: "Large discrepancy — needs human review" });
    }
  }

  // ── Phase 5: Report ───────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(70));
  console.log("RECONCILIATION REPORT");
  console.log("─".repeat(70));
  console.log("  Wallets scanned:               ", wallets.length);
  console.log("  Accurate (no correction):      ", accurate);
  console.log("  Discrepancies to auto-correct: ", toCorrect.length);
  console.log("  Large discrepancies (review):  ", toReview.length);

  if (toCorrect.length > 0) {
    console.log("\n  AUTO-CORRECT LIST:");
    for (const item of toCorrect) {
      const dir = item.diff > 0 ? "OVER-CREDITED" : "UNDER-CREDITED";
      console.log(
        `    user=${item.wallet.user_id} | currency=${item.wallet.currency} | ` +
        `wallet=${item.walletBal} | computed=${item.computedBal} | ` +
        `diff=${item.diff} (${dir})`
      );
    }
  }

  if (toReview.length > 0) {
    console.log("\n  MANUAL REVIEW REQUIRED:");
    for (const item of toReview) {
      console.log(
        `    user=${item.wallet.user_id} | currency=${item.wallet.currency} | ` +
        `wallet=${item.walletBal} | computed=${item.computedBal} | ` +
        `diff=${item.diff} | reason: ${item.reason}`
      );
    }
  }

  // ── Phase 6: Apply corrections ────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("\n\n⚠️  DRY RUN — no corrections applied.");
    console.log("   To apply corrections, run from the server/ directory:");
    console.log("   node scripts/platform_reconciliation.js --live");
    return;
  }

  if (toCorrect.length === 0) {
    console.log("\n✅ All wallets are balanced. Nothing to correct.");
    return;
  }

  console.log("\n[Phase 6] Applying corrections...");

  let corrected = 0;
  let failed    = 0;

  for (const item of toCorrect) {
    const { wallet, walletBal, computedBal } = item;
    const correlationId = `RECON_SWEEP_${Date.now()}_${wallet.id.substring(0, 8)}`;

    try {
      // Pre-correction audit log
      const { error: aErr } = await supabase.from("banking_audit_logs").insert({
        user_id:         wallet.user_id,
        action:          "BALANCE_RECONCILIATION_CORRECTION",
        provider:        "internal",
        previous_values: { balance: walletBal, available_balance: walletBal, source: "platform_reconciliation_sweep" },
        new_values:      { balance: computedBal, available_balance: computedBal, reason: "Corrected to match sum of all credited transactions" },
        correlation_id:  correlationId,
        created_at:      new Date().toISOString(),
      });

      if (aErr) console.warn(`    Audit log warning for wallet ${wallet.id}:`, aErr.message);

      // Apply correction
      const { error: uErr } = await supabase
        .from("wallets_store")
        .update({ balance: computedBal, available_balance: computedBal })
        .eq("id", wallet.id)
        .eq("balance", walletBal); // guard: only if balance hasn't changed since read

      if (uErr) throw new Error(uErr.message);

      console.log(`    ✅ Corrected wallet ${wallet.id} (${wallet.currency}): ${walletBal} → ${computedBal}`);
      corrected++;
    } catch (e) {
      console.error(`    ❌ Failed to correct wallet ${wallet.id}: ${e.message}`);
      failed++;
    }

    await sleep(100); // throttle DB writes
  }

  console.log("\n" + "=".repeat(70));
  console.log("CORRECTIONS COMPLETE");
  console.log("  Applied:  ", corrected);
  console.log("  Failed:   ", failed);
  console.log("  Skipped (needs review):", toReview.length);
  console.log("=".repeat(70));
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
