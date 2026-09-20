const supabase = require("../config/database");

async function run() {
  const { data: accs } = await supabase.from("dedicated_accounts").select("*").eq("account_number", "6179630721");
  console.log("Dedicated accounts matching 6179630721:", accs);
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
