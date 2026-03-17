// timing-analysis.js
require("dotenv").config({ path: ".env" });
const supabase = require("./config/database");

async function run() {
  console.log("Analyzing timing for recent Fincra transactions...");
  
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("id, reference_id, provider, status, created_at, updated_at")
    .eq("provider", "fincra")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching transactions:", error);
    return;
  }

  for (const tx of txs) {
    console.log(`\nTransaction: ${tx.reference_id}`);
    console.log(`Created: ${tx.created_at}`);
    console.log(`Updated: ${tx.updated_at}`);
    
    const start = new Date(tx.created_at);
    const end = new Date(tx.updated_at);
    const diff = (end - start) / 1000;
    console.log(`Total duration to final status: ${diff}s`);

    // Check webhook logs for this reference
    const { data: logs } = await supabase
      .from("webhook_logs")
      .select("created_at, processed, processing_error")
      .eq("reference", tx.reference_id)
      .order("created_at", { ascending: true });

    if (logs && logs.length > 0) {
      console.log("Webhook logs:");
      logs.forEach((log, i) => {
        const logTime = new Date(log.created_at);
        const delayFromStart = (logTime - start) / 1000;
        console.log(`  [${i}] Received: ${log.created_at} (${delayFromStart}s after creation), Processed: ${log.processed}, Error: ${log.processing_error}`);
      });
    } else {
      console.log("No webhook logs found for this reference.");
    }
  }
  process.exit(0);
}
run();
