const supabase = require("../config/database");

async function run() {
  console.log("=== 1. SEARCH PROFILES FOR OLIVIA JOHN AND AGHOGHO OBOH ===");
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, username, full_name, email, role, is_verified, created_at")
    .or("full_name.ilike.%olivia%,full_name.ilike.%aghogho%,username.ilike.%olivia%,username.ilike.%aghogho%");
  console.log("Profiles found:", JSON.stringify(profiles, null, 2));

  console.log("\n=== 2. DEDICATED ACCOUNTS / BANK REFERENCES ===");
  const { data: dedicated, error: dErr } = await supabase
    .from("dedicated_accounts")
    .select("*");
  console.log("Dedicated accounts count:", dedicated?.length);
  console.log("Dedicated accounts:", JSON.stringify(dedicated, null, 2));

  const { data: bankRefs, error: bErr } = await supabase
    .from("user_bank_references")
    .select("*");
  console.log("User bank references:", JSON.stringify(bankRefs, null, 2));

  const { data: walletLinks, error: wErr } = await supabase
    .from("fincra_wallet_links")
    .select("*");
  console.log("Fincra wallet links:", JSON.stringify(walletLinks, null, 2));

  console.log("\n=== 3. RECENT TRANSACTIONS FOR 150 NGN OR DEPOSITS ===");
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("*")
    .or("amount.eq.150,type.eq.DEPOSIT")
    .order("created_at", { ascending: false })
    .limit(20);
  console.log("Recent deposits/150 NGN txs:", JSON.stringify(txs, null, 2));

  console.log("\n=== 4. FINCRA WEBHOOK LOGS ===");
  const { data: fincraLogs, error: fErr } = await supabase
    .from("fincra_webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("Fincra webhook logs:", JSON.stringify(fincraLogs, null, 2));

  console.log("\n=== 5. MANUAL DEPOSITS QUEUE ===");
  const { data: manualDeps, error: mErr } = await supabase
    .from("manual_deposits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("Manual deposits:", JSON.stringify(manualDeps, null, 2));
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
