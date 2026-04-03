const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "placeholder"
);

async function testLimitRequests() {
  console.log("Testing limit requests...");
  
  try {
    const { data, error } = await supabase
      .from("limit_requests")
      .select(`
        *,
        user:profiles!user_id (username, email, full_name, plan_tier, daily_deposit_limit)
      `)
      .limit(1);
      
    if (error) {
      console.error("Error fetching limit requests:", error);
    } else {
      console.log("Limit requests data:", JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("Exception in test:", err);
  }
}

testLimitRequests();
