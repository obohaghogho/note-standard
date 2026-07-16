const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkNowPaymentsTable() {
  const mockAddr = "bc1qdummyaddressforinternaltest1234567890";
  const { data, error } = await supabase
    .from("nowpayments_deposit_addresses")
    .select("*")
    .eq("address", mockAddr);
    
  if (error) {
    console.error("Error fetching from nowpayments_deposit_addresses:", error);
    return;
  }
  
  if (data.length > 0) {
    console.log(`Found ${data.length} entries in nowpayments_deposit_addresses with the mock address.`);
    data.forEach(entry => {
      console.log(`ID: ${entry.id} | Asset: ${entry.asset} | Payment ID: ${entry.payment_id} | Status: ${entry.status}`);
    });
  } else {
    console.log("Mock address NOT found in nowpayments_deposit_addresses.");
  }
}

checkNowPaymentsTable();
