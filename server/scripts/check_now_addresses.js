const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkNowAddresses() {
  const userId = "5089c266-1ad6-4a83-b23f-064d65995345";
  console.log(`Checking nowpayments_deposit_addresses for User ${userId}...`);

  const { data, error } = await supabase
    .from("nowpayments_deposit_addresses")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

checkNowAddresses();
