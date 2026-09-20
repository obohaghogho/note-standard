const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixUserBalance() {
  const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";
  const walletId = "52b58e94-6e78-4ded-9d76-0b5ccd4d49c2";

  console.log("Checking wallet balance...");
  const { data: wallet, error: errWallet } = await supabase
    .from("wallets_store")
    .select("*")
    .eq("id", walletId)
    .single();

  if (errWallet || !wallet) {
    console.error("Error fetching wallet:", errWallet);
    return;
  }

  console.log("Current wallet state:", {
    balance: wallet.balance,
    available_balance: wallet.available_balance,
  });

  const correlationId = `CORR_RECON_${Date.now()}`;

  // Log to banking_audit_logs for double-entry audit trail
  const { data: auditLog, error: errAudit } = await supabase
    .from("banking_audit_logs")
    .insert({
      user_id: userId,
      action: "BALANCE_RECONCILIATION_CORRECTION",
      provider: "internal",
      previous_values: { balance: 4900, available_balance: 6450 },
      new_values: { balance: 6450, available_balance: 6450, reason: "Resolved ledger double deduction discrepancy following 1500 NGN withdrawal" },
      correlation_id: correlationId,
      created_at: new Date().toISOString()
    })
    .select("*");

  if (errAudit) {
    console.warn("Audit log insert error:", errAudit.message);
  } else {
    console.log("✅ Audit log inserted successfully:", auditLog[0]?.id);
  }
}

fixUserBalance();
