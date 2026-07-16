const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findValidUser() {
  console.log(
    "Finding a user with mock crypto address who EXISTS in profiles...",
  );

  const { data: profiles, error: pError } = await supabase
    .from("profiles")
    .select("id")
    .limit(10);

  if (pError) {
    console.error("Error fetching profiles:", pError);
    return;
  }

  const profileIds = profiles.map((p) => p.id);
  console.log(`Checking ${profileIds.length} profiles...`);

  const { data: wallets, error: wError } = await supabase
    .from("wallets_store")
    .select("user_id, currency, network, address")
    .ilike("address", "%-%")
    .in("user_id", profileIds)
    .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

  if (wError) {
    console.error("Error fetching wallets:", wError);
    return;
  }

  if (wallets.length === 0) {
    console.log("No valid user found with mock crypto address.");
  } else {
    console.log(`Found ${wallets.length} valid targets:`);
    wallets.forEach((w) => {
      console.log(
        `- User: ${w.user_id}, Asset: ${w.currency}, Network: ${w.network}, Address: ${w.address}`,
      );
    });
  }
}

findValidUser();
