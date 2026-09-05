const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const { data: oTxs } = await supabase.from("transactions").select("id, amount, currency, status, reference_id, metadata, created_at").eq("user_id", oliviaId);
  console.log("=== OLIVIA JOHN TRANSACTIONS ===");
  console.log(JSON.stringify(oTxs, null, 2));
}

run().then(() => process.exit(0));
