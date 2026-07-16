const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkMockAddresses() {
  console.log("Checking for mock (UUID) addresses in wallets_store...");

  const { data: wallets, error } = await supabase
    .from("wallets_store")
    .select("user_id, currency, network, address")
    .ilike("address", "%-%") // UUIDs have hyphens
    .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

  if (error) {
    console.error("Error fetching wallets:", error);
    return;
  }

  if (wallets.length === 0) {
    console.log("No mock addresses found for crypto assets.");
  } else {
    console.log(`Found ${wallets.length} mock addresses:`);
    wallets.forEach((w) => {
      console.log(
        `- User: ${w.user_id}, Asset: ${w.currency}, Network: ${w.network}, Address: ${w.address}`,
      );
    });
  }
}

checkMockAddresses();
