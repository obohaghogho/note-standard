require("dotenv").config();
const supabase = require("./config/database");
const fs = require("fs");

async function finalCheck() {
  const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";
  const { data: profile } = await supabase.from("profiles").select("plan_tier").eq("id", userId).single();
  const { data: subscription } = await supabase.from("subscriptions").select("*").eq("user_id", userId).single();

  const out = { profile, subscription };
  fs.writeFileSync("final_db_check.json", JSON.stringify(out, null, 2));
  console.log("Check complete.");
}

finalCheck().catch(console.error);
