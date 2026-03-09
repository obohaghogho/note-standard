const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkMockToFile() {
  const { data: wallets, error } = await supabase
    .from("wallets_store")
    .select("user_id, currency, network, address")
    .ilike("address", "%-%")
    .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

  if (error) {
    fs.writeFileSync("mock_out.json", JSON.stringify({ error }));
    return;
  }

  fs.writeFileSync("mock_out.json", JSON.stringify(wallets, null, 2));
}

checkMockToFile();
