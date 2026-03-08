require("dotenv").config();
const supabase = require("./config/database");

async function checkLogs() {
  console.log("Fetching recent webhook logs...");
  const { data, error } = await supabase
    .from("webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching logs:", error.message);
  } else {
    data.forEach((log) => {
      console.log(`\nID:       ${log.id}`);
      console.log(`Provider: ${log.provider}`);
      console.log(`Time:     ${log.created_at}`);
      console.log(`Processed:${log.processed}`);
      console.log(`Error:    ${log.processing_error}`);
      console.log(`Headers:  verif-hash = ${log.headers?.["verif-hash"]}`);
      console.log(
        `Payload:  status = ${
          log.payload?.status || log.payload?.data?.status
        }`,
      );
    });
    if (data.length === 0) {
      console.log(
        "No logs found. Unreachable endpoint or completely blocked before logging.",
      );
    }
  }
}

checkLogs().catch(console.error);
