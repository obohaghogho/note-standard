const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";

  console.log("=== 1. OLIVIA JOHN PROFILE ===");
  const { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", oliviaId).single();
  console.log("Profile:", profile || pErr);

  console.log("\n=== 2. OLIVIA JOHN DEDICATED ACCOUNTS ===");
  const { data: dedicated } = await supabase.from("dedicated_accounts").select("*").eq("user_id", oliviaId);
  console.log("Dedicated accounts:", dedicated);

  console.log("\n=== 3. OLIVIA JOHN BANK REFERENCES ===");
  const { data: bankRefs } = await supabase.from("user_bank_references").select("*").eq("user_id", oliviaId);
  console.log("Bank references:", bankRefs);

  console.log("\n=== 4. OLIVIA JOHN FINCRA WALLET LINKS ===");
  const { data: fincraLinks } = await supabase.from("fincra_wallet_links").select("*").eq("user_id", oliviaId);
  console.log("Fincra links:", fincraLinks);

  console.log("\n=== 5. OLIVIA JOHN WALLETS ===");
  const { data: wallets } = await supabase.from("wallets_v6").select("*").eq("user_id", oliviaId);
  console.log("Wallets:", wallets);

  console.log("\n=== 6. OLIVIA JOHN TRANSACTIONS ===");
  const { data: txs } = await supabase.from("transactions").select("*").eq("user_id", oliviaId).order("created_at", { ascending: false });
  console.log("Transactions count:", txs?.length);
  console.log("Transactions:", txs);

  console.log("\n=== 7. FINCRA WEBHOOK LOGS (SEARCH FOR OLIVIA OR HER ACCOUNT/VIRTUAL ACCOUNT) ===");
  const { data: fincraLogs } = await supabase.from("fincra_webhook_logs").select("*").order("created_at", { ascending: false }).limit(50);
  console.log("Recent Fincra logs total fetched:", fincraLogs?.length);

  // Search if any fincra log contains Olivia's name, email, or account number
  const matchingFincraLogs = (fincraLogs || []).filter(log => {
    const str = JSON.stringify(log);
    return str.toLowerCase().includes("olivia") || 
           (dedicated && dedicated.some(d => d.account_number && str.includes(d.account_number))) ||
           (bankRefs && bankRefs.some(b => b.account_number && str.includes(b.account_number)));
  });
  console.log("Matching Fincra logs for Olivia:", matchingFincraLogs);

  console.log("\n=== 8. ANCHOR WEBHOOK LOGS OR LEDGER ENTRIES ===");
  const { data: anchorLogs } = await supabase.from("anchor_webhook_logs").select("*").order("created_at", { ascending: false }).limit(50);
  console.log("Recent Anchor logs count:", anchorLogs?.length || 0);

  const { data: ledgerEntries } = await supabase.from("ledger_v6").select("*").eq("user_id", oliviaId);
  console.log("Ledger entries for Olivia:", ledgerEntries);
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
