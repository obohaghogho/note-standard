const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkUserWallets() {
  const userId = "5089c266-1ad6-4a83-b23f-064d65995345";
  const { data, error } = await supabase
    .from("wallets_store")
    .select("*")
    .eq("user_id", userId);
    
  if (error) {
    console.error("Error fetching user wallets:", error);
    return;
  }
  
  console.log(`Wallets for User ${userId}:`);
  data.forEach(w => {
    console.log(`- ${w.currency} (${w.network}): ${w.address} | Provider: ${w.provider}`);
  });
}

checkUserWallets();
