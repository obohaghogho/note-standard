/**
 * recover_missed_deposits.js
 * 
 * Recovery script: Finds Paystack-confirmed transactions that are still PENDING
 * (not credited to the wallet), re-verifies them against the Paystack API,
 * and calls the confirm_deposit RPC to credit each wallet.
 * 
 * Usage:
 *   node scripts/recover_missed_deposits.js
 * 
 * Dry-run (no actual changes):
 *   DRY_RUN=true node scripts/recover_missed_deposits.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const supabase = require("../config/database");
const axios = require("axios");

const DRY_RUN = process.env.DRY_RUN === "true";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const LOOK_BACK_HOURS = parseInt(process.env.LOOK_BACK_HOURS || "72", 10);

if (!PAYSTACK_SECRET) {
  console.error("❌ PAYSTACK_SECRET_KEY is not set in .env");
  process.exit(1);
}

const paystackClient = axios.create({
  baseURL: "https://api.paystack.co",
  headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
});

async function verifyWithPaystack(reference) {
  try {
    const res = await paystackClient.get(`/transaction/verify/${reference}`);
    return res.data.data; // { status, amount, currency, reference, metadata }
  } catch (err) {
    console.warn(`  ⚠️  Paystack verify failed for ${reference}: ${err.response?.data?.message || err.message}`);
    return null;
  }
}

async function run() {
  console.log(`\n🔍 Scanning for missed deposits (lookback: ${LOOK_BACK_HOURS}h) [DRY_RUN=${DRY_RUN}]\n`);

  const since = new Date(Date.now() - LOOK_BACK_HOURS * 60 * 60 * 1000).toISOString();

  // 1. Find all PENDING/INITIALIZED paystack transactions in the lookback window
  const { data: pendingTxs, error: fetchErr } = await supabase
    .from("transactions")
    .select("id, user_id, wallet_id, reference_id, provider_reference, amount, currency, status, created_at, metadata")
    .in("provider", ["paystack"])
    .in("status", ["PENDING", "INITIALIZED"])
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (fetchErr) {
    console.error("❌ Failed to fetch pending transactions:", fetchErr.message);
    process.exit(1);
  }

  if (!pendingTxs || pendingTxs.length === 0) {
    console.log("✅ No pending Paystack transactions found in lookback window.");
    process.exit(0);
  }

  console.log(`📋 Found ${pendingTxs.length} pending Paystack transactions. Checking each with Paystack...\n`);

  let credited = 0;
  let skipped = 0;
  let failed = 0;

  for (const tx of pendingTxs) {
    const lookupRef = tx.provider_reference || tx.reference_id;
    console.log(`\n→ TX ${tx.id} | Ref: ${lookupRef} | Amount: ${tx.amount} ${tx.currency} | Status: ${tx.status}`);

    // 2. Verify with Paystack
    const payInfo = await verifyWithPaystack(lookupRef);
    if (!payInfo) {
      console.log(`  ⏭  Skipping — could not verify with Paystack`);
      skipped++;
      continue;
    }

    if (payInfo.status !== "success") {
      console.log(`  ⏭  Paystack status: "${payInfo.status}" — not confirmed. Skipping.`);
      skipped++;
      continue;
    }

    // 3. Paystack confirms success — now credit the wallet
    const amountFromPaystack = payInfo.amount / 100; // kobo → NGN
    console.log(`  ✅ Paystack confirms SUCCESSFUL: ${amountFromPaystack} ${payInfo.currency}`);

    if (!tx.wallet_id) {
      console.log(`  ❌ No wallet_id on transaction — cannot credit. Manual intervention required.`);
      failed++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY_RUN] Would call confirm_deposit for tx ${tx.id}, wallet ${tx.wallet_id}, amount ${amountFromPaystack}`);
      credited++;
      continue;
    }

    // 4. Call confirm_deposit RPC to atomically credit the wallet
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("confirm_deposit", {
      p_transaction_id: tx.id,
      p_wallet_id: tx.wallet_id,
      p_amount: amountFromPaystack,
      p_external_hash: lookupRef,
    });

    if (rpcErr) {
      console.log(`  ❌ RPC confirm_deposit FAILED: ${rpcErr.message}`);
      failed++;
      continue;
    }

    if (rpcResult === false) {
      console.log(`  ⏭  RPC returned false — transaction was already processed (idempotency hit). Skipping status update.`);
      skipped++;
      continue;
    }

    // 5. Mark transaction as COMPLETED
    const { error: updateErr } = await supabase
      .from("transactions")
      .update({
        status: "COMPLETED",
        updated_at: new Date().toISOString(),
        metadata: {
          ...tx.metadata,
          recovered_at: new Date().toISOString(),
          recovered_by: "recover_missed_deposits.js",
          paystack_verified_amount: amountFromPaystack,
        },
      })
      .eq("id", tx.id);

    if (updateErr) {
      console.log(`  ⚠️  Wallet credited but failed to update TX status: ${updateErr.message}`);
    } else {
      console.log(`  💰 WALLET CREDITED: ${amountFromPaystack} ${tx.currency} → Wallet ${tx.wallet_id}`);
    }

    credited++;
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Recovery Summary:`);
  console.log(`  ✅ Credited: ${credited}`);
  console.log(`  ⏭  Skipped:  ${skipped}`);
  console.log(`  ❌ Failed:   ${failed}`);
  console.log(`${"─".repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("💥 Unhandled error:", err.message);
  process.exit(1);
});
