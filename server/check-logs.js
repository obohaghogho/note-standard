// check-logs.js
require("dotenv").config({ path: ".env" });
const supabase = require("./config/database");

async function run() {
  console.log("Checking recent webhook logs...");
  const { data: logs, error } = await supabase.from("webhook_logs")
    .select("id, provider, reference, created_at, processed, processing_error")
    .order("created_at", { ascending: false })
    .limit(5);
    
  if (error || !logs) {
    console.log("No logs found.", error);
  } else {
    console.table(logs);
  }
  
  console.log("\nChecking recent transactions...");
  const { data: txs, error: txError } = await supabase.from("transactions")
    .select("id, reference_id, provider_reference, status, amount, currency, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
    
  if (txError || !txs) {
    console.log("No transactions found.", txError);
  } else {
    console.table(txs);
  }
  process.exit(0);
}
run();
