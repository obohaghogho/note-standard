const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const dedicatedNuban = "6179630721";

  console.log("=== CHECK DEPOSIT SESSIONS FOR OLIVIA ===");
  const { data: sessions } = await supabase.from("deposit_sessions").select("*").eq("user_id", oliviaId);
  console.log("Deposit Sessions:", sessions);

  console.log("\n=== CHECK ANCHOR WEBHOOK LOGS FOR NUBAN 6179630721 ===");
  const { data: anchorLogs } = await supabase.from("anchor_webhook_logs").select("*");
  console.log("Anchor Logs Total:", anchorLogs?.length || 0);

  const matchingAnchorLogs = (anchorLogs || []).filter(l => JSON.stringify(l).includes(dedicatedNuban));
  console.log("Matching Anchor logs for 6179630721:", matchingAnchorLogs);
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
