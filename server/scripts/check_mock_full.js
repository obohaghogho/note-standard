const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkMockAddressesFull() {
  console.log(
    "Checking for mock (UUID) addresses in wallets_store (Full IDs)...",
  );

  const { data: wallets, error } = await supabase
    .from("wallets_store")
    .select("user_id, currency, network, address")
    .ilike("address", "%-%")
    .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

  if (error) {
    console.error("Error fetching wallets:", error);
    return;
  }

  if (wallets.length === 0) {
    console.log("No mock addresses found.");
  } else {
    wallets.forEach((w) => {
      console.log(
        `FULL_USER_ID: ${w.user_id} | Asset: ${w.currency} | Network: ${w.network}`,
      );
    });
  }
}

checkMockAddressesFull();
