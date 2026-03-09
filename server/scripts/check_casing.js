const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkNetworkCasing() {
  const { data, error } = await supabase.from("wallets_store").select("network")
    .limit(10);
  if (error) {
    console.error(error);
  } else {
    const networks = data.map((w) => w.network);
    console.log("Networks in DB:", JSON.stringify(networks));
  }
}

checkNetworkCasing();
