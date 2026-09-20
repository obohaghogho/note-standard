const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const { data: wallet } = await supabase.from("wallets_v6").select("*").eq("user_id", oliviaId).eq("currency", "NGN").single();
  const { data: txs } = await supabase.from("transactions").select("*").eq("user_id", oliviaId).order("created_at", { ascending: false });
  console.log("Wallet:", wallet);
  console.log("Transactions count:", txs?.length);
  console.log("Latest transaction:", txs?.[0]);
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
