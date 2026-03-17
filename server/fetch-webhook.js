// fetch-webhook.js
require("dotenv").config({ path: ".env" });
const supabase = require("./config/database");
const fs = require("fs");

async function run() {
  const { data, error } = await supabase.from("webhook_logs")
    .select("payload")
    .eq("provider", "fincra")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error("Error:", error);
    fs.writeFileSync("webhook.json", JSON.stringify({ error }));
  } else {
    fs.writeFileSync("webhook.json", JSON.stringify(data.payload, null, 2));
  }
  process.exit(0);
}

run();
