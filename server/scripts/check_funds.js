require("dotenv").config({ path: __dirname + "/../.env" });
process.env.SUPABASE_URL = process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const supabase = require("../config/database");

async function checkFunds() {
  const TEST_REF = "tx_aaa40d7469244420b5c2313813087a08"; // the $220 transaction

  console.log("1. Checking Transaction record...");
  const { data: tx } = await supabase
    .from("transactions")
    .select("id, user_id, wallet_id, amount, status, type")
    .eq("reference_id", TEST_REF)
    .single();

  console.log(tx);

  if (tx) {
    console.log("\n2. Checking Ledger Entries for this Transaction...");
    const { data: ledger } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("reference", tx.id);
    console.log(ledger);

    console.log("\n3. Checking Wallet Store for this Wallet...");
    const { data: wallet } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("id", tx.wallet_id)
      .single();
    console.log(wallet);
  }
}

checkFunds();
