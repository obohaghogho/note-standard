/**
 * Diagnostic Script – Aghogho Oboh Wallet 9000 NGN Issue
 *
 * Context:
 *   - Pre-deposit balance was 6,450 NGN
 *   - Deposited 1,000 NGN via Fincra (successful)
 *   - Expected balance: 7,450 NGN
 *   - Actual balance shown: 9,000 NGN  (extra 1,550 NGN over-credited)
 *
 * This script:
 *   1. Reads current wallet state
 *   2. Lists all transactions (deposits, credits)
 *   3. Lists all ledger entries
 *   4. Lists all Fincra webhook logs
 *   5. Lists banking_audit_logs for this user
 *   6. Computes the correct expected balance
 */
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGHOGHO_ID    = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";
const WALLET_ID     = "52b58e94-6e78-4ded-9d76-0b5ccd4d49c2";

async function run() {
  console.log("=".repeat(60));
  console.log("AGHOGHO OBOH — WALLET 9,000 NGN DIAGNOSTIC");
  console.log("=".repeat(60));

  // ── 1. Current Wallet State ──────────────────────────────────────────────
  console.log("\n[1] CURRENT WALLET STATE");
  const { data: wallet, error: wErr } = await supabase
    .from("wallets_v6")
    .select("*")
    .eq("user_id", AGHOGHO_ID)
    .eq("currency", "NGN")
    .maybeSingle();

  if (wErr) console.error("Wallet error:", wErr.message);
  console.log("Wallet:", wallet);

  // ── 2. All Transactions ───────────────────────────────────────────────────
  console.log("\n[2] ALL TRANSACTIONS (most recent first)");
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("id, type, amount, currency, status, payment_status, wallet_credit_status, reference_id, provider_reference, provider, created_at, metadata")
    .eq("user_id", AGHOGHO_ID)
    .order("created_at", { ascending: false });

  if (txErr) console.error("Tx error:", txErr.message);
  (txs || []).forEach((t, i) => {
    console.log(`\n  [Tx #${i+1}]`);
    console.log(`    created:  ${t.created_at}`);
    console.log(`    type:     ${t.type}`);
    console.log(`    amount:   ${t.amount} ${t.currency}`);
    console.log(`    status:   ${t.status}`);
    console.log(`    payment:  ${t.payment_status}`);
    console.log(`    credit:   ${t.wallet_credit_status}`);
    console.log(`    ref:      ${t.reference_id}`);
    console.log(`    prov_ref: ${t.provider_reference}`);
    console.log(`    provider: ${t.provider}`);
  });

  // Compute sum of completed deposits
  const completedDeposits = (txs || []).filter(
    t => t.type === "DEPOSIT" &&
    (t.status === "COMPLETED" || t.wallet_credit_status === "WALLET_CREDITED")
  );
  const totalCredited = completedDeposits.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  console.log(`\n  Total COMPLETED deposit credits: ${totalCredited} NGN`);
  console.log(`  (${completedDeposits.length} deposit transactions credited)`);

  // ── 3. Ledger Entries ─────────────────────────────────────────────────────
  console.log("\n[3] LEDGER ENTRIES (wallets v6)");
  const { data: ledger, error: lErr } = await supabase
    .from("ledger_entries_v6")
    .select("*")
    .eq("wallet_id", WALLET_ID)
    .order("created_at", { ascending: true });

  if (lErr) {
    console.log("  ledger_entries_v6 not found, trying ledger_v6...");
    const { data: ledger2 } = await supabase
      .from("ledger_v6")
      .select("*")
      .eq("wallet_id", WALLET_ID)
      .order("created_at", { ascending: true });

    (ledger2 || []).forEach((e, i) => {
      console.log(`  [L${i+1}] ${e.created_at} | ${e.side || e.type} | ${e.amount} ${e.currency || ''} | ${e.description || ''}`);
    });
  } else {
    (ledger || []).forEach((e, i) => {
      console.log(`  [L${i+1}] ${e.created_at} | side=${e.side} | ${e.amount} | ${e.description || ''}`);
    });
  }

  // ── 4. Fincra Webhook Logs ────────────────────────────────────────────────
  console.log("\n[4] FINCRA WEBHOOK LOGS (all, most recent first)");
  const { data: fincraLogs, error: fErr } = await supabase
    .from("fincra_webhook_logs")
    .select("id, event_type, payload, processed, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (fErr) console.error("Fincra logs error:", fErr.message);

  (fincraLogs || []).forEach((log, i) => {
    const d = log.payload?.data || log.payload || {};
    const amount = d.sourceAmount || d.amount || d.amountReceived || "?";
    const customer = d.customerName || d.senderAccountName || "?";
    const ref = d.reference || d.id || "?";
    console.log(`\n  [FW${i+1}] ${log.created_at}`);
    console.log(`    event:    ${log.event_type}`);
    console.log(`    ref:      ${ref}`);
    console.log(`    amount:   ${amount}`);
    console.log(`    customer: ${customer}`);
    console.log(`    processed:${log.processed}`);
  });

  // ── 5. Fincra Transactions ────────────────────────────────────────────────
  console.log("\n[5] FINCRA_TRANSACTIONS FOR AGHOGHO");
  const { data: fincraTxs, error: ftErr } = await supabase
    .from("fincra_transactions")
    .select("*")
    .eq("user_id", AGHOGHO_ID)
    .order("created_at", { ascending: false });

  if (ftErr) console.error("Fincra txs error:", ftErr.message);
  (fincraTxs || []).forEach((t, i) => {
    console.log(`\n  [FT${i+1}] ${t.created_at} | ${t.type} | ${t.amount} ${t.currency} | status=${t.status} | ref=${t.fincra_reference}`);
  });

  // ── 6. Banking Audit Logs ─────────────────────────────────────────────────
  console.log("\n[6] BANKING_AUDIT_LOGS FOR AGHOGHO");
  const { data: auditLogs, error: aErr } = await supabase
    .from("banking_audit_logs")
    .select("id, action, provider, previous_values, new_values, created_at")
    .eq("user_id", AGHOGHO_ID)
    .order("created_at", { ascending: false });

  if (aErr) console.error("Audit logs error:", aErr.message);
  (auditLogs || []).forEach((a, i) => {
    console.log(`\n  [A${i+1}] ${a.created_at} | ${a.action} | prev=${JSON.stringify(a.previous_values)} → new=${JSON.stringify(a.new_values)}`);
  });

  // ── 7. Summary & Verdict ──────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("VERDICT");
  console.log("=".repeat(60));
  const currentBalance = parseFloat(wallet?.balance || 0);
  const expectedBalance = 7450; // 6,450 pre-deposit + 1,000 NGN deposit
  const excess = currentBalance - expectedBalance;

  console.log(`  Current wallet balance:   ${currentBalance} NGN`);
  console.log(`  Expected correct balance: ${expectedBalance} NGN`);
  console.log(`  Excess (over-credit):     ${excess} NGN`);

  if (excess > 0) {
    console.log(`\n  ⚠️  OVER-CREDIT DETECTED: ${excess} NGN must be corrected`);
    console.log(`     Run: node scripts/fix_aghogho_9000.js`);
  } else if (excess === 0) {
    console.log(`\n  ✅ Balance is already correct — no fix needed`);
  } else {
    console.log(`\n  ❓ Balance is LOWER than expected — investigate deposits`);
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
