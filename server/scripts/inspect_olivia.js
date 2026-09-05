const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const aghoghoId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

  console.log("=== OLIVIA JOHN PROFILE ===");
  const { data: oliviaProfile } = await supabase.from("profiles").select("*").eq("id", oliviaId).single();
  console.log(oliviaProfile);

  console.log("\n=== OLIVIA JOHN WALLETS ===");
  const { data: oliviaWallets } = await supabase.from("wallets_v6").select("*").eq("user_id", oliviaId);
  console.log(oliviaWallets);

  console.log("\n=== OLIVIA JOHN BANK REFERENCES (user_bank_references) ===");
  const { data: oliviaBankRefs } = await supabase.from("user_bank_references").select("*").eq("user_id", oliviaId);
  console.log(oliviaBankRefs);

  console.log("\n=== OLIVIA JOHN DEDICATED ACCOUNTS ===");
  const { data: oliviaDedicated } = await supabase.from("dedicated_accounts").select("*").eq("user_id", oliviaId);
  console.log(oliviaDedicated);

  console.log("\n=== OLIVIA JOHN FINCRA WALLET LINKS ===");
  const { data: oliviaFincra } = await supabase.from("fincra_wallet_links").select("*").eq("user_id", oliviaId);
  console.log(oliviaFincra);

  console.log("\n=== AGHOGHO OBOH BANK REFERENCES & DEDICATED ACCOUNTS ===");
  const { data: aghoghoBankRefs } = await supabase.from("user_bank_references").select("*").eq("user_id", aghoghoId);
  console.log("Aghogho bank refs:", aghoghoBankRefs);
  const { data: aghoghoDedicated } = await supabase.from("dedicated_accounts").select("*").eq("user_id", aghoghoId);
  console.log("Aghogho dedicated accs:", aghoghoDedicated);
  const { data: aghoghoFincra } = await supabase.from("fincra_wallet_links").select("*").eq("user_id", aghoghoId);
  console.log("Aghogho fincra links:", aghoghoFincra);

  console.log("\n=== ALL DEDICATED NGN ACCOUNTS IN SYSTEM ===");
  const { data: allNgnAccs } = await supabase.from("dedicated_accounts").select("*").eq("currency", "NGN");
  console.log(allNgnAccs);

  console.log("\n=== ALL FINCRA WALLET LINKS IN SYSTEM ===");
  const { data: allFincraLinks } = await supabase.from("fincra_wallet_links").select("*");
  console.log(allFincraLinks);

  console.log("\n=== ALL RECENT TRANSACTIONS FOR OLIVIA AND AGHOGHO ===");
  const { data: txs } = await supabase.from("transactions").select("*").in("user_id", [oliviaId, aghoghoId]).order("created_at", { ascending: false });
  console.log(txs);

  console.log("\n=== ALL RECENT FINCRA WEBHOOK LOGS ===");
  const { data: fincraLogs } = await supabase.from("fincra_webhook_logs").select("*").order("created_at", { ascending: false }).limit(5);
  console.log(JSON.stringify(fincraLogs, null, 2));
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
