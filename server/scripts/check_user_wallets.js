const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkUserWallets() {
  const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";
  console.log(`--- Checking Wallets for User: ${userId} ---`);

  const { data: wallets, error } = await supabase
    .from("wallets_store")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching wallets:", error.message);
    return;
  }

  if (!wallets || wallets.length === 0) {
    console.log("No wallets found for this user.");
    return;
  }

  wallets.forEach((w) => {
    console.log(`--- Wallet ---`);
    console.log(`Currency: ${w.currency}`);
    console.log(`Network: ${w.network}`);
    console.log(`Balance: ${w.balance}`);
    console.log(`Avail: ${w.available_balance}`);
  });
}

checkUserWallets().catch(console.error);
