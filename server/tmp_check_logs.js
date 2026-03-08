require("dotenv").config();
const supabase = require("./config/database");

async function checkLogs() {
  console.log("Fetching recent webhook logs...");
  const { data, error } = await supabase
    .from("webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching logs:", error.message);
  } else {
    console.log("Recent Webhook Logs:");
    data.forEach((log) => {
      console.log(`\nID: ${log.id}`);
      console.log(`Provider: ${log.provider}`);
      console.log(`Time: ${log.created_at}`);
      console.log(`Processed: ${log.processed}`);
      console.log(`Error: ${log.processing_error}`);
      console.log(
        `Headers:`,
        JSON.stringify(log.headers?.["verif-hash"] || "No verif-hash header"),
      );
    });
    if (data.length === 0) {
      console.log(
        "No webhook logs found. The requests might not be reaching the server.",
      );
    }
  }

  process.exit(0);
}

checkLogs();
