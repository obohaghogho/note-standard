/**
 * Fix Aghogho Oboh NGN Wallet Balance
 *
 * Findings from forensic audit (compute_aghogho_correct_balance.js):
 *   - 42 NGN deposit transactions, all legitimate
 *   - Computed correct balance: 9,100 NGN
 *   - Current wallet balance:   9,000 NGN
 *   - Wallet is UNDER-credited by 100 NGN
 *
 * wallets_v6 is a VIEW — we must update the underlying base table.
 * We try: wallets_store → wallets → user_wallets in order.
 */
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGHOGHO_ID     = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";
const WALLET_ID      = "52b58e94-6e78-4ded-9d76-0b5ccd4d49c2";
const CURRENT_BAL    = 9000;
const CORRECT_BAL    = 9100;

// Tables to try in priority order
const CANDIDATE_TABLES = ["wallets_store", "wallets", "user_wallets"];

async function findBaseTable() {
  for (const tbl of CANDIDATE_TABLES) {
    // Try fetching by wallet id first
    const { data: byId, error: eId } = await supabase
      .from(tbl)
      .select("id, balance, available_balance")
      .eq("id", WALLET_ID)
      .maybeSingle();

    if (!eId && byId) {
      console.log(`  Found wallet in table "${tbl}" (by id): balance=${byId.balance}`);
      return { table: tbl, row: byId, key: "id", keyVal: WALLET_ID };
    }

    // Try fetching by user_id + currency
    const { data: byUser, error: eUser } = await supabase
      .from(tbl)
      .select("id, balance, available_balance")
      .eq("user_id", AGHOGHO_ID)
      .eq("currency", "NGN")
      .maybeSingle();

    if (!eUser && byUser) {
      console.log(`  Found wallet in table "${tbl}" (by user_id+currency): balance=${byUser.balance}`);
      return { table: tbl, row: byUser, key: "user_id", keyVal: AGHOGHO_ID };
    }
  }
  return null;
}

async function fix() {
  console.log("=".repeat(60));
  console.log("AGHOGHO OBOH — WALLET BALANCE CORRECTION");
  console.log("=".repeat(60));
  console.log(`Current balance:  ${CURRENT_BAL} NGN`);
  console.log(`Correct balance:  ${CORRECT_BAL} NGN`);
  console.log(`Correction delta: +${CORRECT_BAL - CURRENT_BAL} NGN`);

  // ── Step 1: Verify via wallets_v6 view ──────────────────────────────────
  console.log("\n[1] Verifying current state via wallets_v6 view...");
  const { data: viewRow, error: vErr } = await supabase
    .from("wallets_v6")
    .select("id, balance, available_balance")
    .eq("id", WALLET_ID)
    .maybeSingle();

  if (vErr) {
    console.error("Cannot read wallets_v6:", vErr.message);
    process.exit(1);
  }

  const liveBalance = parseFloat(viewRow?.balance ?? -1);
  console.log(`  View shows balance: ${liveBalance} NGN`);

  if (liveBalance !== CURRENT_BAL) {
    console.error(`\n⚠️  Live balance (${liveBalance}) does not match expected ${CURRENT_BAL} NGN.`);
    console.error("   Balance may have already changed. Aborting.");
    process.exit(1);
  }

  // ── Step 2: Locate the base table ──────────────────────────────────────
  console.log("\n[2] Locating underlying base table for wallets_v6...");
  const found = await findBaseTable();

  if (!found) {
    console.error("\n❌ Could not find wallet record in any known base table.");
    console.error("   Tried:", CANDIDATE_TABLES.join(", "));
    process.exit(1);
  }

  const { table, row, key, keyVal } = found;
  console.log(`  Using table: "${table}", key: ${key}=${keyVal}`);

  // ── Step 3: Write audit log BEFORE change ──────────────────────────────
  console.log("\n[3] Writing pre-correction audit log...");
  const correlationId = `CORR_AGHOGHO_9000_FIX_${Date.now()}`;

  const { error: auditErr } = await supabase
    .from("banking_audit_logs")
    .insert({
      user_id:         AGHOGHO_ID,
      action:          "BALANCE_RECONCILIATION_CORRECTION",
      provider:        "internal",
      previous_values: {
        balance:           CURRENT_BAL,
        available_balance: CURRENT_BAL,
        source_table:      table,
        reason:            "Forensic audit: wallet_v6 showed 9000 NGN; ledger of 42 credited deposits sums to 9100 NGN"
      },
      new_values: {
        balance:           CORRECT_BAL,
        available_balance: CORRECT_BAL,
        reason:            "Corrected +100 NGN under-credit after full transaction ledger reconciliation"
      },
      correlation_id:  correlationId,
      created_at:      new Date().toISOString(),
    });

  if (auditErr) {
    console.warn("  ⚠️  Audit log warning:", auditErr.message, "— continuing...");
  } else {
    console.log("  ✅ Audit log written. Correlation ID:", correlationId);
  }

  // ── Step 4: Apply balance correction on base table ─────────────────────
  console.log(`\n[4] Updating "${table}"...`);

  let updateQuery = supabase
    .from(table)
    .update({ balance: CORRECT_BAL, available_balance: CORRECT_BAL });

  if (key === "id") {
    updateQuery = updateQuery.eq("id", keyVal).eq("balance", CURRENT_BAL);
  } else {
    updateQuery = updateQuery
      .eq("user_id", keyVal)
      .eq("currency", "NGN")
      .eq("balance", CURRENT_BAL);
  }

  const { data: updated, error: updateErr } = await updateQuery
    .select("id, balance, available_balance")
    .single();

  if (updateErr) {
    console.error(`\n❌ Update failed on "${table}":`, updateErr.message);
    process.exit(1);
  }

  if (!updated) {
    console.error("\n❌ No rows updated — balance guard matched nothing.");
    process.exit(1);
  }

  // ── Step 5: Verify via view again ─────────────────────────────────────
  console.log("\n[5] Re-reading wallets_v6 to confirm fix...");
  const { data: postView } = await supabase
    .from("wallets_v6")
    .select("balance, available_balance")
    .eq("id", WALLET_ID)
    .maybeSingle();

  console.log("  balance:           ", postView?.balance);
  console.log("  available_balance: ", postView?.available_balance);

  const finalBal = parseFloat(postView?.balance ?? -1);
  if (finalBal === CORRECT_BAL) {
    console.log(`\n✅ SUCCESS — Aghogho Oboh NGN wallet corrected to ${CORRECT_BAL} NGN`);
  } else {
    console.error(`\n❌ Final balance ${finalBal} does not match expected ${CORRECT_BAL} — investigate!`);
    process.exit(1);
  }
}

fix().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
