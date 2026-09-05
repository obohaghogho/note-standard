const supabase = require("../config/database");

async function run() {
  const { data: bankRefs } = await supabase.from("user_bank_references").select("*, profiles:user_id(id, full_name, email, username)");
  console.log("=== USER BANK REFERENCES ===");
  console.log(JSON.stringify(bankRefs, null, 2));

  const { data: txs } = await supabase.from("transactions").select("*, profiles:user_id(full_name, email)").order("created_at", { ascending: false }).limit(10);
  console.log("=== RECENT TRANSACTIONS ===");
  console.log(JSON.stringify(txs, null, 2));
}

run().then(() => process.exit(0));
