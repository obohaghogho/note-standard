const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const aghoghoId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

  console.log("=== OLIVIA JOHN WALLETS ===");
  const { data: oWallets } = await supabase.from("wallets_v6").select("*").eq("user_id", oliviaId);
  console.log(oWallets);

  console.log("=== OLIVIA JOHN TRANSACTIONS ===");
  const { data: oTxs } = await supabase.from("transactions").select("*").eq("user_id", oliviaId);
  console.log(oTxs);

  console.log("\n=== AGHOGHO OBOH WALLETS ===");
  const { data: aWallets } = await supabase.from("wallets_v6").select("*").eq("user_id", aghoghoId);
  console.log(aWallets);

  console.log("=== AGHOGHO OBOH TRANSACTIONS ===");
  const { data: aTxs } = await supabase.from("transactions").select("*").eq("user_id", aghoghoId).order("created_at", { ascending: false }).limit(5);
  console.log(aTxs);
}

run().then(() => process.exit(0));
