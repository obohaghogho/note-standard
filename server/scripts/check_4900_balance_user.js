const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check4900User() {
  console.log("Searching for NGN wallets with balance = 4900 or available = 6450...");

  // 1. Search wallets_store
  const { data: storeWallets, error: err1 } = await supabase
    .from("wallets_store")
    .select("*")
    .eq("currency", "NGN")
    .or("balance.eq.4900,available_balance.eq.6450,balance.eq.6450,available_balance.eq.4900");

  if (err1) {
    console.error("Error fetching wallets_store:", err1);
  } else {
    console.log("Matching wallets_store records:", JSON.stringify(storeWallets, null, 2));
  }

  // 2. Search all NGN wallets with balance between 4000 and 7000
  const { data: rangeWallets, error: err2 } = await supabase
    .from("wallets_store")
    .select("id, user_id, currency, network, balance, available_balance, pending_balance, locked_balance, updated_at")
    .eq("currency", "NGN")
    .gte("balance", 4000)
    .lte("balance", 7000);

  if (err2) {
    console.error("Error fetching rangeWallets:", err2);
  } else {
    console.log("Range NGN Wallets (4000-7000 NGN):", JSON.stringify(rangeWallets, null, 2));
  }
}

check4900User();
