const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectRecentHistory() {
  const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

  const { data: audit } = await supabase
    .from("banking_audit_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", "2026-09-06T00:00:00Z")
    .order("created_at", { ascending: true });
  
  console.log("=== BANKING AUDIT LOGS (SEPT 6 ONWARDS) ===");
  console.log(JSON.stringify(audit, null, 2));

  const { data: store } = await supabase
    .from("wallets_store")
    .select("*")
    .eq("user_id", userId);
  console.log("=== WALLETS STORE ===");
  console.log(JSON.stringify(store, null, 2));
}

inspectRecentHistory();
