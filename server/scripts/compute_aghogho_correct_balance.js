/**
 * Compute aghogho oboh's correct NGN balance from ALL ledger transactions.
 */
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGHOGHO_ID = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

async function run() {
  const { data: txs } = await supabase
    .from("transactions")
    .select("id, type, amount, currency, status, payment_status, wallet_credit_status, reference_id, provider, created_at, fee")
    .eq("user_id", AGHOGHO_ID)
    .eq("currency", "NGN")
    .order("created_at", { ascending: true });

  console.log("ALL NGN Transactions for Aghogho Oboh:");
  console.log("=".repeat(100));

  let runningBalance = 0;

  (txs || []).forEach((t, i) => {
    const amt = parseFloat(t.amount || 0);
    const fee = parseFloat(t.fee || 0);
    const isCredited = t.status === "COMPLETED" &&
      (t.wallet_credit_status === "WALLET_CREDITED" || t.payment_status === "WALLET_CREDITED");

    let delta = 0;
    if (isCredited) {
      if (t.type === "DEPOSIT") {
        delta = amt;
        runningBalance += amt;
      } else if (t.type === "WITHDRAWAL" || t.type === "DEBIT") {
        delta = -(amt + fee);
        runningBalance -= (amt + fee);
      }
    }

    const flagged = !isCredited ? " [SKIPPED - not completed]" : "";
    console.log(
      "[" + (i + 1) + "] " + t.created_at.substring(0, 16) +
      " | " + t.type.padEnd(10) +
      " | " + String(t.amount).padStart(8) + " NGN" +
      " | credited=" + String(isCredited).padEnd(5) +
      " | delta=" + String(delta).padStart(8) +
      " | balance=" + String(runningBalance).padStart(8) +
      " | " + (t.reference_id || "no-ref") + flagged
    );
  });

  console.log("\n" + "=".repeat(100));
  console.log("COMPUTED CORRECT BALANCE: " + runningBalance + " NGN");
  console.log("CURRENT  WALLET BALANCE:  9000 NGN");
  console.log("DIFFERENCE:               " + (9000 - runningBalance) + " NGN (over-credit if positive)");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
