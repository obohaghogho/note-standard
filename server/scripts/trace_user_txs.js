const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function traceUserTxs() {
  const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

  console.log("=== TRANSACTIONS TABLE ===");
  const { data: txs } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  console.log(JSON.stringify(txs, null, 2));

  console.log("\n=== FINCRA TRANSACTIONS TABLE ===");
  const { data: fincraTxs } = await supabase
    .from("fincra_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  console.log(JSON.stringify(fincraTxs, null, 2));

  console.log("\n=== LEDGER ENTRIES TABLE ===");
  const { data: ledger } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  console.log(JSON.stringify(ledger, null, 2));

  console.log("\n=== BANKING AUDIT LOGS ===");
  const { data: audit } = await supabase
    .from("banking_audit_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  console.log(JSON.stringify(audit, null, 2));
}

traceUserTxs();
