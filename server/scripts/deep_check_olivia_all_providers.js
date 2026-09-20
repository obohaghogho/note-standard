const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const oliviaEmail = "johntatyana45@gmail.com";

  console.log("=== 1. ALL TRANSACTIONS FOR OLIVIA (ALL STATUSES) ===");
  const { data: allTxs } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", oliviaId)
    .order("created_at", { ascending: false });
  console.log("All Olivia Txs:", JSON.stringify(allTxs, null, 2));

  console.log("\n=== 2. ALL DEPOSIT SESSIONS FOR OLIVIA (ALL STATUSES) ===");
  const { data: allSessions } = await supabase
    .from("deposit_sessions")
    .select("*")
    .eq("user_id", oliviaId)
    .order("created_at", { ascending: false });
  console.log("All Olivia Sessions:", JSON.stringify(allSessions, null, 2));

  console.log("\n=== 3. SEARCH ALL FINCRA WEBHOOK LOGS FOR AMOUNT 200 OR 20000 OR 200.00 ===");
  const { data: fincraLogs } = await supabase
    .from("fincra_webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const matchedFincra = (fincraLogs || []).filter(l => {
    const s = JSON.stringify(l);
    return s.includes("200") || s.toLowerCase().includes("olivia") || s.includes("johntatyana45");
  });
  console.log("Matched Fincra logs count:", matchedFincra.length);
  console.log("Matched Fincra logs:", JSON.stringify(matchedFincra, null, 2));

  console.log("\n=== 4. CHECK RECENT ANCHOR WEBHOOK LOGS ===");
  const { data: anchorLogs } = await supabase
    .from("anchor_webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  console.log("Anchor logs count:", anchorLogs?.length || 0);
  console.log("Anchor logs:", anchorLogs);

  console.log("\n=== 5. CHECK RECENT NOTIFICATIONS FOR OLIVIA ===");
  const { data: notes } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", oliviaId)
    .order("created_at", { ascending: false });
  console.log("Olivia Notifications:", notes);

  console.log("\n=== 6. CHECK AUDIT LOGS FOR OLIVIA ===");
  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("user_id", oliviaId)
    .order("created_at", { ascending: false });
  console.log("Audit logs:", auditLogs);
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
