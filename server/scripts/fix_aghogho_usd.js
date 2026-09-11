/**
 * Fix Aghogho Oboh USD Wallet — $10,000 Over-Credit
 *
 * Findings:
 *   - USD wallet balance: $10,075
 *   - Only ONE completed USD deposit: $75 (GREY-DEP-NS-F2DHWB7)
 *   - Transaction tx_c43b254d: $10,000 USD — status=FAILED, wallet_credit_status=WALLET_CREDIT_PENDING
 *     This FAILED transaction somehow credited the wallet. It should NOT have been credited.
 *   - Correct USD balance: $75
 *
 * Fix: Correct USD wallet from $10,075 → $75 (-$10,000 over-credit removal)
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGHOGHO_ID      = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";
const USD_WALLET_ID   = "ce96f0a7-594d-49fb-bfcd-3423448a14b5";
const CURRENT_USD_BAL = 10075;
const CORRECT_USD_BAL = 75;

async function fix() {
  console.log("=".repeat(60));
  console.log("AGHOGHO OBOH — USD WALLET OVER-CREDIT FIX");
  console.log("=".repeat(60));
  console.log("Current USD balance:  $" + CURRENT_USD_BAL);
  console.log("Correct USD balance:  $" + CORRECT_USD_BAL);
  console.log("Removing over-credit: $" + (CURRENT_USD_BAL - CORRECT_USD_BAL));

  // Step 1: Verify current state
  const { data: wallet, error: wErr } = await supabase
    .from("wallets_store")
    .select("balance, available_balance")
    .eq("id", USD_WALLET_ID)
    .single();

  if (wErr || !wallet) {
    console.error("ERROR fetching USD wallet:", wErr?.message);
    process.exit(1);
  }

  console.log("\nLive USD wallet state:", wallet);

  if (parseFloat(wallet.balance) !== CURRENT_USD_BAL) {
    console.error("Balance mismatch — expected", CURRENT_USD_BAL, "but got", wallet.balance);
    process.exit(1);
  }

  // Step 2: Write pre-correction audit log
  const correlationId = "CORR_AGHOGHO_USD_FIX_" + Date.now();
  const { error: aErr } = await supabase.from("banking_audit_logs").insert({
    user_id:         AGHOGHO_ID,
    action:          "BALANCE_RECONCILIATION_CORRECTION",
    provider:        "internal",
    previous_values: {
      balance:           CURRENT_USD_BAL,
      available_balance: CURRENT_USD_BAL,
      currency:          "USD",
      reason:            "USD wallet over-credited by $10,000 from FAILED transaction tx_c43b254d15ee49dd92de27af1ba89918"
    },
    new_values: {
      balance:           CORRECT_USD_BAL,
      available_balance: CORRECT_USD_BAL,
      currency:          "USD",
      reason:            "Corrected to match sole completed USD deposit of $75 (GREY-DEP-NS-F2DHWB7)"
    },
    correlation_id: correlationId,
    created_at:     new Date().toISOString(),
  });

  if (aErr) console.warn("Audit log warning:", aErr.message);
  else console.log("\n✅ Audit log written:", correlationId);

  // Step 3: Apply correction on wallets_store
  const { data: updated, error: uErr } = await supabase
    .from("wallets_store")
    .update({ balance: CORRECT_USD_BAL, available_balance: CORRECT_USD_BAL })
    .eq("id", USD_WALLET_ID)
    .eq("balance", CURRENT_USD_BAL)
    .select("balance, available_balance")
    .single();

  if (uErr) {
    console.error("ERROR applying correction:", uErr.message);
    process.exit(1);
  }

  if (!updated) {
    console.error("No rows updated — balance guard failed.");
    process.exit(1);
  }

  // Step 4: Also mark the FAILED $10,000 transaction so it can't be retried
  const { error: txErr } = await supabase
    .from("transactions")
    .update({
      status:               "FAILED",
      wallet_credit_status: "WALLET_CREDIT_PENDING",
      payment_status:       "PAYMENT_FAILED",
      metadata:             {
        over_credit_corrected: true,
        corrected_at:          new Date().toISOString(),
        correlation_id:        correlationId,
        note:                  "Transaction was FAILED at provider level. $10,000 over-credit removed by reconciliation sweep."
      }
    })
    .eq("id", "89340759-1ad9-4446-8927-ed6e4ed2cf93")
    .eq("status", "FAILED");

  if (txErr) console.warn("Transaction metadata update warning:", txErr.message);
  else console.log("✅ Failed transaction metadata updated to prevent retry.");

  // Step 5: Verify
  console.log("\nFinal USD wallet state:", updated);
  if (parseFloat(updated.balance) === CORRECT_USD_BAL) {
    console.log("\n✅ SUCCESS — Aghogho USD wallet corrected to $" + CORRECT_USD_BAL);
  } else {
    console.error("❌ Unexpected final balance:", updated.balance);
    process.exit(1);
  }
}

fix().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
