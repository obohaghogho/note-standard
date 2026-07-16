require("dotenv").config();
const supabase = require("./config/database");
const fs = require("fs");

async function checkLogs() {
  const { data, error } = await supabase
    .from("webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    fs.writeFileSync("logs_out.txt", "Error: " + error.message);
    return;
  }

  const lines = data.map((log) =>
    `Time: ${log.created_at} | Processed: ${log.processed} | Error: ${log.processing_error} | verif-hash: ${
      log.headers?.["verif-hash"]
    } | status: ${log.payload?.status || log.payload?.data?.status}`
  );
  fs.writeFileSync("logs_out.txt", lines.join("\n"));
}

checkLogs();
