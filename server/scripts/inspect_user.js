const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectAll() {
  const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

  const tables = [
    "wallets_store",
    "wallets",
    "user_balances",
    "ledger_entries",
    "treasury_provider_balances",
    "banking_audit_logs",
    "withdrawal_requests",
    "payment_transactions",
    "transactions"
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select("*").eq("user_id", userId);
      if (!error && data && data.length > 0) {
        console.log(`=== Table: ${table} (${data.length} records) ===`);
        console.log(JSON.stringify(data, null, 2));
      } else if (error) {
        console.log(`Table ${table} error:`, error.message);
      }
    } catch(e) {
      console.log(`Table ${table} catch error:`, e.message);
    }
  }
}

inspectAll();
