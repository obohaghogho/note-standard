const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const oliviaNuban = "6179630721";

  console.log("=== 1. ALL FINCRA WEBHOOK LOGS FROM TODAY (2026-09-06) ===");
  const { data: fincraLogsToday } = await supabase
    .from("fincra_webhook_logs")
    .select("*")
    .gte("created_at", "2026-09-06T00:00:00.000Z")
    .order("created_at", { ascending: false });
  
  console.log(`Total Fincra webhooks today (${fincraLogsToday?.length || 0}):`);
  console.log(JSON.stringify(fincraLogsToday, null, 2));

  console.log("\n=== 2. ALL ANCHOR WEBHOOK LOGS FROM TODAY (2026-09-06) ===");
  const { data: anchorLogsToday } = await supabase
    .from("anchor_webhook_logs")
    .select("*")
    .gte("created_at", "2026-09-06T00:00:00.000Z")
    .order("created_at", { ascending: false });

  console.log(`Total Anchor webhooks today (${anchorLogsToday?.length || 0}):`);
  console.log(JSON.stringify(anchorLogsToday, null, 2));

  console.log("\n=== 3. ALL DEPOSIT SESSIONS CREATED OR UPDATED TODAY ===");
  const { data: depositSessions } = await supabase
    .from("deposit_sessions")
    .select("*")
    .gte("created_at", "2026-09-06T00:00:00.000Z")
    .order("created_at", { ascending: false });

  console.log("Deposit sessions today:", depositSessions);

  console.log("\n=== 4. ALL TRANSACTIONS CREATED TODAY ===");
  const { data: txsToday } = await supabase
    .from("transactions")
    .select("*")
    .gte("created_at", "2026-09-06T00:00:00.000Z")
    .order("created_at", { ascending: false });

  console.log("Transactions today:", txsToday);

  console.log("\n=== 5. CHECK ALL FINCRA WEBHOOK LOGS UNPROCESSED OR PROCESSED RECENTLY ===");
  const { data: recentFincra } = await supabase
    .from("fincra_webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  console.log("Recent Fincra webhooks (last 20):", JSON.stringify(recentFincra, null, 2));
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
