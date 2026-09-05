const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const aghoghoId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

  console.log("==========================================");
  console.log("1. FETCH ALL FINCRA WEBHOOK LOGS IN DATABASE");
  console.log("==========================================");
  const { data: allFincraLogs, error: fErr } = await supabase
    .from("fincra_webhook_logs")
    .select("id, event_type, payload, processed, created_at")
    .order("created_at", { ascending: false });

  console.log(`Total Fincra webhook logs count: ${allFincraLogs?.length || 0}`);
  (allFincraLogs || []).forEach((log, index) => {
    const d = log.payload?.data || log.payload || {};
    console.log(`\n--- Log #${index + 1} (ID: ${log.id}, Created: ${log.created_at}) ---`);
    console.log(`Event: ${log.event_type}`);
    console.log(`Reference: ${d.reference || d.id || 'N/A'}`);
    console.log(`Amount: ${d.sourceAmount || d.amount || d.amountReceived}`);
    console.log(`Customer: ${d.customerName || d.senderAccountName}`);
    console.log(`Description/Narration: ${d.description || d.narration}`);
  });

  console.log("\n==========================================");
  console.log("2. FETCH ALL TRANSACTIONS IN DATABASE");
  console.log("==========================================");
  const { data: allTxs } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  console.log(`Total transactions count: ${allTxs?.length || 0}`);
  (allTxs || []).forEach((tx, index) => {
    console.log(`\n--- Tx #${index + 1} ---`);
    console.log(`ID: ${tx.id}, UserID: ${tx.user_id}`);
    console.log(`Type: ${tx.type}, Status: ${tx.status}, CreditStatus: ${tx.wallet_credit_status}`);
    console.log(`Amount: ${tx.amount} ${tx.currency}, Ref: ${tx.reference_id}, ProviderRef: ${tx.provider_reference}`);
    console.log(`Metadata:`, JSON.stringify(tx.metadata));
  });

  console.log("\n==========================================");
  console.log("3. FETCH ALL WALLETS FOR OLIVIA AND AGHOGHO");
  console.log("==========================================");
  const { data: oWallets } = await supabase.from("wallets_v6").select("*").eq("user_id", oliviaId);
  const { data: aWallets } = await supabase.from("wallets_v6").select("*").eq("user_id", aghoghoId);
  console.log("Olivia Wallets:", JSON.stringify(oWallets, null, 2));
  console.log("Aghogho Wallets:", JSON.stringify(aWallets, null, 2));

  console.log("\n==========================================");
  console.log("4. SEARCH FOR S5879LT IN ALL TABLES AND LOGS");
  console.log("==========================================");
  const matchingLogs = (allFincraLogs || []).filter(l => JSON.stringify(l).includes("S5879LT") || JSON.stringify(l).includes("5879"));
  console.log("Webhook logs containing S5879LT:", JSON.stringify(matchingLogs, null, 2));

  const matchingTxs = (allTxs || []).filter(t => JSON.stringify(t).includes("S5879LT") || JSON.stringify(t).includes("5879"));
  console.log("Transactions containing S5879LT:", JSON.stringify(matchingTxs, null, 2));
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Deep trace error:", err);
  process.exit(1);
});
